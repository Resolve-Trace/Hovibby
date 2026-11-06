/**
 * ResolveTrace Stellar / Soroban client
 *
 * Wraps stellar-sdk interactions with the ResolveTrace Registry contract.
 * All network-dependent operations go through this module.
 *
 * TRANSACTION STATES:
 *   1. NOT_SUBMITTED    — Transaction has not been sent to the network.
 *   2. AWAITING_WALLET  — Waiting for wallet signature.
 *   3. SIGNED           — Transaction is signed but not yet submitted.
 *   4. SUBMITTED        — Transaction has been sent to the network.
 *   5. CONFIRMED        — Transaction is included in a finalized ledger.
 *   6. FAILED           — Transaction was rejected by the network.
 *   7. TIMEOUT          — Confirmation timed out. Status is unknown.
 *                         A timeout does NOT mean the transaction failed.
 *
 * NEVER report a CONFIRMED status from a SUBMITTED state alone.
 * Always wait for the transaction to appear in a ledger.
 */

import * as StellarSdk from "stellar-sdk";
import type { Checkpoint } from "@resolvetrace/protocol";
import { fromHex } from "@resolvetrace/protocol";
import type { OnChainClient } from "@resolvetrace/protocol";

export type TransactionStatus =
  | "NOT_SUBMITTED"
  | "AWAITING_WALLET"
  | "SIGNED"
  | "SUBMITTED"
  | "CONFIRMED"
  | "FAILED"
  | "TIMEOUT";

export interface StellarNetworkConfig {
  rpcUrl: string;
  networkPassphrase: string;
  contractId: string;
  /** Optional Horizon URL for account info */
  horizonUrl?: string;
}

export interface TransactionResult {
  status: TransactionStatus;
  txHash?: string;
  ledger?: number;
  error?: string;
  explorerUrl?: string;
}

// Stellar Testnet explorer base URL
const EXPLORER_BASE = "https://stellar.expert/explorer/testnet/tx/";

/**
 * The StellarClient wraps soroban contract calls for the ResolveTrace
 * registry contract. It does NOT hold private keys; callers must provide
 * a signed transaction or use the wallet-signing flow.
 */
export class StellarClient implements OnChainClient {
  private readonly rpc: StellarSdk.rpc.Server;
  private readonly config: StellarNetworkConfig;

  constructor(config: StellarNetworkConfig) {
    this.config = config;
    this.rpc = new StellarSdk.rpc.Server(config.rpcUrl, {
      allowHttp: config.rpcUrl.startsWith("http://"),
    });
  }

  /**
   * Get the batch commitment stored on-chain for a given checkpoint.
   * Returns undefined if the checkpoint does not exist or is not found.
   */
  async getCheckpointCommitment(
    _contractId: string,
    registryId: string,
    checkpointSequence: number
  ): Promise<string | undefined> {
    try {
      const contractId = this.config.contractId;
      // Call the contract's get_checkpoint function
      const result = await this.rpc.simulateTransaction(
        this.buildGetCheckpointTx(contractId, registryId, checkpointSequence)
      );

      if (!StellarSdk.rpc.Api.isSimulationSuccess(result)) {
        return undefined;
      }

      // Parse the result — batch_commitment is a Bytes field
      const successResult = result as StellarSdk.rpc.Api.SimulateTransactionSuccessResponse;
      const retval = successResult.result?.retval;
      if (!retval) return undefined;

      // The contract returns an Option<CheckpointData>
      // If present, extract batch_commitment
      const scVal = retval;
      if (scVal.switch() === StellarSdk.xdr.ScValType.scvVoid()) {
        return undefined;
      }

      // Parse the CheckpointData struct to extract batch_commitment
      return this.parseCheckpointCommitment(scVal);
    } catch (e) {
      console.warn("getCheckpointCommitment failed:", e);
      return undefined;
    }
  }

  /**
   * Build a simulation transaction for get_checkpoint.
   * This is a read-only call that does not require signing.
   */
  private buildGetCheckpointTx(
    contractId: string,
    registryId: string,
    sequence: number
  ): StellarSdk.Transaction {
    const contract = new StellarSdk.Contract(contractId);

    const op = contract.call(
      "get_checkpoint",
      StellarSdk.nativeToScVal(registryId, { type: "string" }),
      StellarSdk.nativeToScVal(sequence, { type: "u32" })
    );

    // Use a throwaway account for simulation reads
    const account = new StellarSdk.Account(
      StellarSdk.Keypair.random().publicKey(),
      "0"
    );

    return new StellarSdk.TransactionBuilder(account, {
      fee: "100",
      networkPassphrase: this.config.networkPassphrase,
    })
      .addOperation(op)
      .setTimeout(30)
      .build();
  }

  /**
   * Parse the batch_commitment bytes from a CheckpointData ScVal.
   * Returns hex-encoded commitment or undefined.
   */
  private parseCheckpointCommitment(
    scVal: StellarSdk.xdr.ScVal
  ): string | undefined {
    try {
      // The contract returns Option<CheckpointData> as a struct
      if (scVal.switch() === StellarSdk.xdr.ScValType.scvMap()) {
        const map = scVal.map();
        if (!map) return undefined;

        for (const entry of map) {
          const keyStr = entry.key().sym()?.toString();
          if (keyStr === "batch_commitment") {
            const bytes = entry.val().bytes();
            if (bytes) {
              return Buffer.from(bytes).toString("hex");
            }
          }
        }
      }
    } catch (e) {
      console.warn("parseCheckpointCommitment failed:", e);
    }
    return undefined;
  }

  /**
   * Build a register_checkpoint transaction for wallet signing.
   *
   * Returns a transaction that must be signed by the writer's wallet
   * before being submitted.
   *
   * NEVER sign transactions on behalf of users in client-side code.
   */
  async buildRegisterCheckpointTx(
    writerPublicKey: string,
    registryId: string,
    checkpoint: Checkpoint
  ): Promise<StellarSdk.Transaction> {
    const contractId = this.config.contractId;
    const contract = new StellarSdk.Contract(contractId);

    // Convert the hex commitment to bytes
    const commitmentBytes = Buffer.from(
      fromHex(checkpoint.batchCommitment)
    );
    const prevCommitmentBytes = checkpoint.previousCheckpointCommitment
      ? Buffer.from(fromHex(checkpoint.previousCheckpointCommitment))
      : Buffer.alloc(32, 0);

    const op = contract.call(
      "register_checkpoint",
      StellarSdk.nativeToScVal(registryId, { type: "string" }),
      StellarSdk.nativeToScVal(writerPublicKey, { type: "address" }),
      StellarSdk.nativeToScVal(checkpoint.checkpointSequence, { type: "u32" }),
      StellarSdk.nativeToScVal(checkpoint.eventSequenceStart, { type: "u32" }),
      StellarSdk.nativeToScVal(checkpoint.eventSequenceEnd, { type: "u32" }),
      StellarSdk.xdr.ScVal.scvBytes(commitmentBytes),
      StellarSdk.xdr.ScVal.scvBytes(prevCommitmentBytes),
      StellarSdk.nativeToScVal(checkpoint.policyVersion, { type: "string" })
    );

    const account = await this.rpc.getAccount(writerPublicKey);

    // Simulate first to get the authorization footprint
    const tx = new StellarSdk.TransactionBuilder(account, {
      fee: "100",
      networkPassphrase: this.config.networkPassphrase,
    })
      .addOperation(op)
      .setTimeout(30)
      .build();

    const sim = await this.rpc.simulateTransaction(tx);
    if (!StellarSdk.rpc.Api.isSimulationSuccess(sim)) {
      throw new Error(
        `Transaction simulation failed: ${JSON.stringify(sim)}`
      );
    }

    // Assemble the transaction with the simulation results (auth entries, fee)
    return StellarSdk.rpc.assembleTransaction(tx, sim).build();
  }

  /**
   * Submit a signed transaction to the network.
   * Returns the transaction hash. Does NOT wait for confirmation.
   *
   * NEVER call this with an unsigned transaction.
   */
  async submitTransaction(
    signedTx: StellarSdk.Transaction
  ): Promise<string> {
    const response = await this.rpc.sendTransaction(signedTx);
    if (response.status === "ERROR") {
      throw new Error(`Transaction submission failed: ${JSON.stringify(response)}`);
    }
    return response.hash;
  }

  /**
   * Poll for transaction confirmation.
   *
   * Returns the final TransactionResult.
   * A timeout returns status TIMEOUT — NOT FAILED.
   * A timeout does not mean the transaction was not included in a ledger.
   */
  async waitForConfirmation(
    txHash: string,
    timeoutMs = 60000,
    pollIntervalMs = 3000
  ): Promise<TransactionResult> {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      try {
        const response = await this.rpc.getTransaction(txHash);

        if (response.status === StellarSdk.rpc.Api.GetTransactionStatus.SUCCESS) {
          return {
            status: "CONFIRMED",
            txHash,
            ledger: response.ledger,
            explorerUrl: `${EXPLORER_BASE}${txHash}`,
          };
        }

        if (response.status === StellarSdk.rpc.Api.GetTransactionStatus.FAILED) {
          return {
            status: "FAILED",
            txHash,
            error: "Transaction failed on-chain.",
            explorerUrl: `${EXPLORER_BASE}${txHash}`,
          };
        }

        // NOT_FOUND or pending — keep polling
      } catch (e) {
        console.warn("Polling error:", e);
      }

      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }

    return {
      status: "TIMEOUT",
      txHash,
      error:
        "Confirmation timed out. The transaction may still be included in a later ledger. " +
        `Check the explorer: ${EXPLORER_BASE}${txHash}`,
      explorerUrl: `${EXPLORER_BASE}${txHash}`,
    };
  }

  /**
   * Get registry metadata from the contract.
   */
  async getRegistry(registryId: string): Promise<Record<string, unknown> | null> {
    try {
      const contract = new StellarSdk.Contract(this.config.contractId);
      const op = contract.call(
        "get_registry",
        StellarSdk.nativeToScVal(registryId, { type: "string" })
      );
      const account = new StellarSdk.Account(
        StellarSdk.Keypair.random().publicKey(),
        "0"
      );
      const tx = new StellarSdk.TransactionBuilder(account, {
        fee: "100",
        networkPassphrase: this.config.networkPassphrase,
      })
        .addOperation(op)
        .setTimeout(30)
        .build();

      const sim = await this.rpc.simulateTransaction(tx);
      if (!StellarSdk.rpc.Api.isSimulationSuccess(sim)) return null;

      const simSuccess = sim as StellarSdk.rpc.Api.SimulateTransactionSuccessResponse;
      const retval = simSuccess.result?.retval;
      if (!retval) return null;
      if (retval.switch() === StellarSdk.xdr.ScValType.scvVoid()) return null;

      return StellarSdk.scValToNative(retval) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}

/**
 * Create a StellarClient from environment variables.
 * Throws a descriptive error if required variables are missing.
 */
export function createStellarClientFromEnv(): StellarClient {
  const rpcUrl = process.env["STELLAR_RPC_URL"] ??
    process.env["NEXT_PUBLIC_STELLAR_RPC_URL"];
  const contractId = process.env["CONTRACT_ID"] ??
    process.env["NEXT_PUBLIC_CONTRACT_ID"];
  const networkPassphrase = process.env["STELLAR_NETWORK_PASSPHRASE"] ??
    process.env["NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE"] ??
    StellarSdk.Networks.TESTNET;

  if (!rpcUrl) {
    throw new Error(
      "STELLAR_RPC_URL or NEXT_PUBLIC_STELLAR_RPC_URL is required. " +
        "Set it in your .env.local file."
    );
  }
  if (!contractId) {
    throw new Error(
      "CONTRACT_ID or NEXT_PUBLIC_CONTRACT_ID is required. " +
        "Deploy the contract first and set the address in .env.local."
    );
  }

  return new StellarClient({ rpcUrl, networkPassphrase, contractId });
}
