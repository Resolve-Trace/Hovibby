#!/usr/bin/env node
/**
 * ResolveTrace Independent Verifier CLI
 *
 * Usage:
 *   resolvetrace-verify verify <bundle.json>
 *   resolvetrace-verify inspect <bundle.json>
 *   resolvetrace-verify version
 *
 * Options:
 *   --json              Output structured JSON result
 *   --contract-id <id>  Contract address for on-chain verification
 *   --rpc-url <url>     Stellar RPC URL (defaults to Testnet)
 *
 * Exit codes:
 *   0 — Verification passed (VALID)
 *   1 — Verification failed
 *   2 — Input error (file not found, invalid format)
 *   3 — Network unavailable (offline verification passed, on-chain failed)
 *
 * WHAT "VALID" MEANS:
 *   The bundle is internally consistent: event hashes, the hash chain,
 *   signatures (where public keys are present), and the checkpoint
 *   commitment all match. If an on-chain client was provided and found
 *   the commitment on Stellar, the bundle is confirmed against the ledger.
 *
 * WHAT "VALID" DOES NOT MEAN:
 *   - The events were not selectively withheld.
 *   - The underlying complaint is truthful.
 *   - The actors' real-world identities are verified.
 */

import { readFile } from "fs/promises";
import { resolve } from "path";
import {
  verifyBundle,
  VerificationStatus,
  PROTOCOL_VERSION,
  type VerificationBundle,
  type VerificationResult,
} from "@resolvetrace/protocol";
import { StellarClient } from "@resolvetrace/sdk";
import * as StellarSdk from "stellar-sdk";

// ─── CLI Entry Point ──────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const command = args[0];

async function main(): Promise<void> {
  if (!command || command === "help" || command === "--help" || command === "-h") {
    printHelp();
    process.exit(0);
  }

  if (command === "version") {
    console.log(`resolvetrace-verify v0.1.0 (protocol v${PROTOCOL_VERSION})`);
    process.exit(0);
  }

  if (command === "verify" || command === "inspect") {
    const bundlePath = args[1];
    const jsonOutput = args.includes("--json");
    const contractId = getFlag(args, "--contract-id");
    const rpcUrl = getFlag(args, "--rpc-url") ??
      "https://soroban-testnet.stellar.org";

    if (!bundlePath) {
      console.error("Error: Bundle file path is required.");
      console.error("Usage: resolvetrace-verify verify <bundle.json>");
      process.exit(2);
    }

    const absolutePath = resolve(process.cwd(), bundlePath);

    let bundle: VerificationBundle;
    try {
      const raw = await readFile(absolutePath, "utf-8");
      bundle = JSON.parse(raw) as VerificationBundle;
    } catch (e) {
      console.error(`Error: Could not read bundle file: ${absolutePath}`);
      console.error(String(e));
      process.exit(2);
    }

    // Set up on-chain client if contract ID is provided
    let stellarClient: StellarClient | undefined;
    if (contractId) {
      try {
        stellarClient = new StellarClient({
          rpcUrl,
          networkPassphrase: StellarSdk.Networks.TESTNET,
          contractId,
        });
      } catch (e) {
        console.warn(`Warning: Could not initialize Stellar client: ${e}`);
      }
    }

    const result = await verifyBundle({
      bundle,
      ...(contractId !== undefined ? { contractId } : {}),
      ...(stellarClient !== undefined ? { onChainClient: stellarClient } : {}),
    });

    if (command === "inspect") {
      printInspection(bundle, result, jsonOutput);
    } else {
      printVerificationResult(result, jsonOutput);
    }

    // Exit code
    if (result.status === VerificationStatus.VALID) {
      process.exit(0);
    } else if (result.status === VerificationStatus.NETWORK_UNAVAILABLE) {
      process.exit(3);
    } else {
      process.exit(1);
    }
  }

  console.error(`Unknown command: ${command}`);
  printHelp();
  process.exit(2);
}

// ─── Output Formatters ────────────────────────────────────────────────────────

function printVerificationResult(
  result: VerificationResult,
  jsonOutput: boolean
): void {
  if (jsonOutput) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  const statusIcon =
    result.status === VerificationStatus.VALID ? "✅" : "❌";

  console.log(`\n${statusIcon} Verification Result: ${result.status}`);
  console.log("─".repeat(60));
  console.log(`Organization:   ${result.organizationId}`);
  console.log(`Workflow:       ${result.workflowId}`);
  console.log(`Protocol v:     ${result.protocolVersion}`);
  console.log(`Total events:   ${result.totalEvents}`);
  console.log(`Checked at:     ${result.checkedAt}`);
  console.log(`Network used:   ${result.networkUsed ? "Yes" : "No"}`);
  console.log("");
  console.log("Summary:");
  console.log("  " + result.summary);

  if (result.checkpointResult) {
    const cp = result.checkpointResult;
    console.log("\nCheckpoint:");
    console.log(`  Sequence:       ${cp.checkpointSequence}`);
    console.log(
      `  Local valid:    ${cp.localCommitmentValid ? "✅" : "❌"}`
    );
    if (cp.onChainMatch !== undefined) {
      console.log(
        `  On-chain match: ${cp.onChainMatch ? "✅" : "❌"}`
      );
    }
    if (cp.stellarTxHash) {
      console.log(`  Tx hash:        ${cp.stellarTxHash}`);
    }
  }

  if (result.warnings.length > 0) {
    console.log("\nWarnings:");
    result.warnings.forEach((w) => console.log(`  ⚠️  ${w}`));
  }

  if (result.errors.length > 0) {
    console.log("\nErrors:");
    result.errors.forEach((e) => console.log(`  ❌ ${e}`));
  }

  console.log("\nEvent Details:");
  result.verifiedEvents.forEach((ev) => {
    const sigIcon =
      ev.signatureValid === true
        ? "🔑✅"
        : ev.signatureValid === false
        ? "🔑❌"
        : "🔑–";
    const hashIcon = ev.hashValid ? "🔗✅" : "🔗❌";
    const chainIcon = ev.chainLinkValid ? "⛓️ ✅" : "⛓️ ❌";
    console.log(
      `  seq=${String(ev.sequence).padStart(3)} id=${ev.eventId.slice(0, 8)}… ${hashIcon} ${sigIcon} ${chainIcon}`
    );
  });

  console.log("\n" + buildCertification(result));
}

function printInspection(
  bundle: VerificationBundle,
  result: VerificationResult,
  jsonOutput: boolean
): void {
  if (jsonOutput) {
    console.log(JSON.stringify({ bundle, verification: result }, null, 2));
    return;
  }

  console.log("\n📦 Bundle Inspection");
  console.log("─".repeat(60));
  console.log(`Protocol version:  ${bundle.protocolVersion}`);
  console.log(`Organization:      ${bundle.organizationId}`);
  console.log(`Workflow ID:       ${bundle.workflowId}`);
  console.log(`Events:            ${bundle.events.length}`);
  console.log(`Exported at:       ${bundle.exportedAt}`);
  console.log(`Policy version:    ${bundle.policy.version}`);

  if (bundle.checkpoint) {
    console.log("\nCheckpoint:");
    console.log(`  Sequence:        ${bundle.checkpoint.checkpointSequence}`);
    console.log(`  Event range:     ${bundle.checkpoint.eventSequenceStart}–${bundle.checkpoint.eventSequenceEnd}`);
    console.log(`  Commitment:      ${bundle.checkpoint.batchCommitment.slice(0, 16)}…`);
    console.log(`  Hash:            ${bundle.checkpoint.checkpointHash.slice(0, 16)}…`);
  } else {
    console.log("\n⚠️  No checkpoint in bundle. Events are not anchored on Stellar.");
  }

  console.log("\nEvents:");
  bundle.events.forEach((ev) => {
    console.log(
      `  [${String(ev.sequence).padStart(3)}] ${ev.eventType.padEnd(35)} ${ev.actorRole.padEnd(10)} ${ev.claimedAt}`
    );
  });

  console.log("\nAuthorization Evidence:");
  const keys = Object.keys(bundle.authorizationEvidence);
  if (keys.length === 0) {
    console.log("  (none)");
  } else {
    keys.forEach((k) => {
      const roles = bundle.authorizationEvidence[k]?.join(", ") ?? "";
      console.log(`  ${k.slice(0, 16)}…  roles: ${roles}`);
    });
  }

  console.log("\n");
  printVerificationResult(result, false);
}

function buildCertification(result: VerificationResult): string {
  const lines = [
    "─".repeat(60),
    "VERIFICATION CERTIFICATE",
    "─".repeat(60),
    `Status:          ${result.status}`,
    `Checked at:      ${result.checkedAt}`,
    `Protocol v:      ${result.protocolVersion}`,
    `Events verified: ${result.totalEvents}`,
    `Network checked: ${result.networkUsed}`,
    "─".repeat(60),
    "IMPORTANT:",
    "A VALID result means the bundle is internally consistent and",
    "matches the cryptographic commitments recorded. It does NOT",
    "prove that all events were disclosed, that underlying claims",
    "are true, or that actors' real-world identities were verified.",
    "─".repeat(60),
  ];
  return lines.join("\n");
}

function printHelp(): void {
  console.log(`
ResolveTrace Independent Verifier v0.1.0

USAGE:
  resolvetrace-verify <command> [options]

COMMANDS:
  verify <bundle.json>     Verify a verification bundle
  inspect <bundle.json>    Inspect bundle contents and verify
  version                  Print version information
  help                     Show this help

OPTIONS:
  --json                   Output structured JSON result
  --contract-id <id>       Contract address for on-chain verification
  --rpc-url <url>          Stellar RPC URL (default: Testnet)

EXIT CODES:
  0   Verification passed (VALID)
  1   Verification failed
  2   Input error (file not found, invalid format)
  3   Network unavailable (offline verification passed, on-chain check failed)

EXAMPLES:
  # Offline verification (no network required):
  resolvetrace-verify verify ./case-bundle.json

  # Full on-chain verification:
  resolvetrace-verify verify ./case-bundle.json \\
    --contract-id CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4

  # Machine-readable output:
  resolvetrace-verify verify ./case-bundle.json --json

WHAT "VALID" MEANS:
  The presented bundle is internally consistent: event hashes,
  the hash chain, signatures (where keys are present), and the
  checkpoint commitment all match.

  It does NOT mean:
  - Events were not selectively withheld.
  - The underlying complaint is truthful.
  - Actors' real-world identities are verified.
`);
}

function getFlag(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx === -1) return undefined;
  return args[idx + 1];
}

// Run
main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
