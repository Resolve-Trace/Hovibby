/**
 * ResolveTrace independent verifier (protocol layer).
 *
 * Accepts a VerificationBundle and validates:
 *   1. Schema and protocol version
 *   2. Event serialization correctness
 *   3. Event sequence ordering
 *   4. Hash-chain links
 *   5. Digital signatures
 *   6. Actor authorization evidence
 *   7. Checkpoint commitment
 *   8. On-chain commitment comparison (when network is available)
 *
 * Returns a structured VerificationResult — never just a boolean.
 *
 * WHAT THIS VERIFIER ESTABLISHES:
 *   - The presented event bundle is internally consistent with its cryptographic commitments.
 *   - The bundle matches the commitment recorded on Stellar (when network is available).
 *   - Signatures were made by keys with authorization evidence in the bundle.
 *
 * WHAT THIS VERIFIER DOES NOT ESTABLISH:
 *   - The truth of the underlying claims in any event.
 *   - That no events were withheld by the organization.
 *   - The real-world identity of any actor.
 *   - That a Stellar timestamp proves when a real-world event occurred.
 */

import {
  type VerificationBundle,
  type VerificationResult,
  type EventVerificationResult,
  type CheckpointVerificationResult,
  VerificationStatus,
  PROTOCOL_VERSION,
} from "./types.js";
import { validateHashChain, verifyEventSignature, extractUnsignedEvent } from "./events.js";
import { computeEventHash } from "./hashing.js";
import { verifyBatchCommitment, verifyCheckpointHash } from "./checkpoint.js";
import { validatePolicy } from "./policy.js";

// ─── On-chain retrieval interface ─────────────────────────────────────────────

/**
 * Interface for retrieving on-chain checkpoint state.
 * Network-dependent; may return undefined when the network is unavailable.
 */
export interface OnChainClient {
  getCheckpointCommitment(
    contractId: string,
    registryId: string,
    checkpointSequence: number
  ): Promise<string | undefined>;
  getTxHash?(
    contractId: string,
    registryId: string,
    checkpointSequence: number
  ): Promise<string | undefined>;
}

export interface VerifyBundleOptions {
  bundle: VerificationBundle;
  contractId?: string;
  onChainClient?: OnChainClient;
}

// ─── Verification ─────────────────────────────────────────────────────────────

/**
 * Verify a VerificationBundle.
 *
 * This is the core independent verification function.
 * It can run entirely offline (without a blockchain connection).
 * When an OnChainClient and contractId are provided, it also validates
 * the commitment recorded on Stellar.
 */
export async function verifyBundle(
  options: VerifyBundleOptions
): Promise<VerificationResult> {
  const { bundle, contractId, onChainClient } = options;
  const warnings: string[] = [];
  const errors: string[] = [];
  let status: VerificationStatus = VerificationStatus.VALID;

  const checkedAt = new Date().toISOString();

  // ── 1. Protocol version ───────────────────────────────────────────────────

  if (bundle.protocolVersion !== PROTOCOL_VERSION) {
    return {
      status: VerificationStatus.UNSUPPORTED_PROTOCOL_VERSION,
      protocolVersion: bundle.protocolVersion,
      organizationId: bundle.organizationId,
      workflowId: bundle.workflowId,
      totalEvents: bundle.events.length,
      verifiedEvents: [],
      warnings: [],
      errors: [
        `Unsupported protocol version: ${bundle.protocolVersion}. ` +
          `This verifier supports version ${PROTOCOL_VERSION}.`,
      ],
      checkedAt,
      networkUsed: false,
      summary:
        "Verification failed: unsupported protocol version.",
    };
  }

  // ── 2. Schema validation ──────────────────────────────────────────────────

  if (!bundle.events || bundle.events.length === 0) {
    return {
      status: VerificationStatus.INCOMPLETE_BUNDLE,
      protocolVersion: bundle.protocolVersion,
      organizationId: bundle.organizationId,
      workflowId: bundle.workflowId,
      totalEvents: 0,
      verifiedEvents: [],
      warnings: [],
      errors: ["Bundle contains no events."],
      checkedAt,
      networkUsed: false,
      summary: "Verification failed: bundle is empty.",
    };
  }

  const policyErrors = validatePolicy(bundle.policy);
  if (policyErrors.length > 0) {
    warnings.push(
      `Policy validation warnings: ${policyErrors.join("; ")}`
    );
  }

  // ── 3. Hash chain validation ──────────────────────────────────────────────

  const chainErrors = validateHashChain(bundle.events);
  if (chainErrors.length > 0) {
    status = VerificationStatus.BROKEN_HASH_CHAIN;
    errors.push(...chainErrors);
  }

  // ── 4. Per-event verification ─────────────────────────────────────────────

  const verifiedEvents: EventVerificationResult[] = [];

  for (const event of bundle.events) {
    const unsigned = extractUnsignedEvent(event);
    const recomputedHash = computeEventHash(unsigned);
    const hashValid = recomputedHash === event.eventHash;

    if (!hashValid) {
      errors.push(
        `Event ${event.eventId} (seq=${event.sequence}): hash mismatch.`
      );
      if (status === VerificationStatus.VALID) {
        status = VerificationStatus.BROKEN_HASH_CHAIN;
      }
    }

    // Chain link
    const sorted = [...bundle.events].sort((a, b) => a.sequence - b.sequence);
    const idx = sorted.findIndex((e) => e.eventId === event.eventId);
    let chainLinkValid = true;
    if (idx === 0) {
      chainLinkValid = event.previousEventHash === "";
    } else {
      const prev = sorted[idx - 1];
      if (prev) {
        const prevUnsigned = extractUnsignedEvent(prev);
        const prevHash = computeEventHash(prevUnsigned);
        chainLinkValid = event.previousEventHash === prevHash;
      }
    }

    // Signature
    let signatureValid: boolean | "skipped" = "skipped";
    if (event.actorPublicKey && event.signature) {
      try {
        signatureValid = await verifyEventSignature(event);
        if (!signatureValid) {
          errors.push(
            `Event ${event.eventId} (seq=${event.sequence}): invalid signature.`
          );
          if (status === VerificationStatus.VALID) {
            status = VerificationStatus.INVALID_SIGNATURE;
          }
        }
        // Check authorization evidence
        if (
          signatureValid &&
          !bundle.authorizationEvidence[event.actorPublicKey]
        ) {
          warnings.push(
            `Event ${event.eventId}: actor public key not found in authorization evidence. ` +
              `Cannot confirm the actor was authorized at the time of this event.`
          );
          if (status === VerificationStatus.VALID) {
            status = VerificationStatus.UNAUTHORIZED_ACTOR;
          }
        }
      } catch (e) {
        signatureValid = false;
        errors.push(
          `Event ${event.eventId}: signature verification threw an error: ${e}`
        );
        if (status === VerificationStatus.VALID) {
          status = VerificationStatus.INVALID_SIGNATURE;
        }
      }
    } else if (!event.actorPublicKey) {
      warnings.push(
        `Event ${event.eventId} (seq=${event.sequence}): no actorPublicKey; signature cannot be verified.`
      );
      if (status === VerificationStatus.VALID) {
        status = VerificationStatus.UNAUTHORIZED_ACTOR;
      }
    }

    verifiedEvents.push({
      eventId: event.eventId,
      sequence: event.sequence,
      hashValid,
      signatureValid,
      chainLinkValid,
    });
  }

  // ── 5. Checkpoint verification ────────────────────────────────────────────

  let checkpointResult: CheckpointVerificationResult | undefined;
  let networkUsed = false;

  if (bundle.checkpoint) {
    const chk = bundle.checkpoint;

    // Verify checkpointHash
    const localHashValid = verifyCheckpointHash(chk);
    if (!localHashValid) {
      errors.push("Checkpoint: checkpointHash does not match checkpoint contents.");
      if (status === VerificationStatus.VALID) {
        status = VerificationStatus.CHECKPOINT_MISMATCH;
      }
    }

    // Verify batch commitment
    const batchMatch = verifyBatchCommitment(bundle.events, chk);
    if (!batchMatch) {
      errors.push(
        "Checkpoint: batch commitment does not match the event batch."
      );
      if (status === VerificationStatus.VALID) {
        status = VerificationStatus.CHECKPOINT_MISMATCH;
      }
    }

    checkpointResult = {
      checkpointSequence: chk.checkpointSequence,
      localCommitmentValid: localHashValid && batchMatch,
    };

    // Check for unanchored events (events after the checkpoint range)
    const maxSeq = Math.max(...bundle.events.map((e) => e.sequence));
    if (maxSeq > chk.eventSequenceEnd) {
      warnings.push(
        `Events ${chk.eventSequenceEnd + 1}–${maxSeq} are not yet included in any confirmed checkpoint. ` +
          `They are locally recorded but not independently anchored.`
      );
      if (status === VerificationStatus.VALID) {
        status = VerificationStatus.UNANCHORED_EVENTS;
      }
    }

    // ── 6. On-chain commitment ────────────────────────────────────────────

    if (onChainClient && contractId) {
      try {
        const onChainCommitment = await onChainClient.getCheckpointCommitment(
          contractId,
          chk.registryId,
          chk.checkpointSequence
        );
        networkUsed = true;

        if (onChainCommitment === undefined) {
          warnings.push(
            "On-chain commitment not found for this checkpoint sequence. " +
              "The checkpoint may not have been submitted, or the contract may be using a different registry ID."
          );
          if (status === VerificationStatus.VALID) {
            status = VerificationStatus.UNANCHORED_EVENTS;
          }
          checkpointResult.onChainMatch = false;
        } else {
          const onChainMatch = onChainCommitment === chk.batchCommitment;
          checkpointResult.onChainCommitment = onChainCommitment;
          checkpointResult.onChainMatch = onChainMatch;

          if (!onChainMatch) {
            errors.push(
              `On-chain commitment mismatch. ` +
                `Local: ${chk.batchCommitment}, On-chain: ${onChainCommitment}`
            );
            status = VerificationStatus.CHECKPOINT_MISMATCH;
          }

          // Optionally get tx hash
          if (onChainClient.getTxHash) {
            const txHash = await onChainClient.getTxHash(
              contractId,
              chk.registryId,
              chk.checkpointSequence
            );
            if (txHash) {
              checkpointResult.stellarTxHash = txHash;
            }
          }
        }
      } catch (e) {
        networkUsed = true;
        warnings.push(
          `Network error during on-chain verification: ${e}. ` +
            `On-chain check could not be completed.`
        );
        if (status === VerificationStatus.VALID) {
          status = VerificationStatus.NETWORK_UNAVAILABLE;
        }
        // Do not set onChainMatch — it remains absent (network unavailable)
      }
    } else if (!bundle.checkpoint) {
      warnings.push(
        "No checkpoint in bundle; on-chain verification is not possible."
      );
      if (status === VerificationStatus.VALID) {
        status = VerificationStatus.UNANCHORED_EVENTS;
      }
    }
  } else {
    warnings.push(
      "No checkpoint included in this bundle. Events are not independently anchored on Stellar."
    );
    if (status === VerificationStatus.VALID) {
      status = VerificationStatus.UNANCHORED_EVENTS;
    }
  }

  // ── 7. Summary ────────────────────────────────────────────────────────────

  const summary = buildSummary(
    status,
    bundle.events.length,
    verifiedEvents,
    networkUsed,
    errors,
    warnings
  );

  return {
    status,
    protocolVersion: bundle.protocolVersion,
    organizationId: bundle.organizationId,
    workflowId: bundle.workflowId,
    totalEvents: bundle.events.length,
    verifiedEvents,
    ...(checkpointResult !== undefined ? { checkpointResult } : {}),
    warnings,
    errors,
    checkedAt,
    networkUsed,
    summary,
  };
}

function buildSummary(
  status: VerificationStatus,
  totalEvents: number,
  results: EventVerificationResult[],
  networkUsed: boolean,
  errors: string[],
  warnings: string[]
): string {
  const signedCount = results.filter((r) => r.signatureValid === true).length;
  const hashValidCount = results.filter((r) => r.hashValid).length;
  const chainValidCount = results.filter((r) => r.chainLinkValid).length;

  const networkNote = networkUsed
    ? "On-chain commitment was checked."
    : "On-chain commitment was NOT checked (no network or no contract ID).";

  if (status === VerificationStatus.VALID) {
    return (
      `All ${totalEvents} events passed verification. ` +
      `${hashValidCount}/${totalEvents} hashes valid, ` +
      `${signedCount}/${totalEvents} signatures valid, ` +
      `${chainValidCount}/${totalEvents} chain links valid. ` +
      networkNote
    );
  }

  return (
    `Verification status: ${status}. ` +
    `${errors.length} error(s), ${warnings.length} warning(s). ` +
    `${hashValidCount}/${totalEvents} hashes valid, ` +
    `${signedCount}/${totalEvents} signatures valid. ` +
    networkNote +
    (errors.length > 0 ? ` First error: ${errors[0]}` : "")
  );
}
