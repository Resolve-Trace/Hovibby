/**
 * ResolveTrace checkpoint construction and verification.
 *
 * A checkpoint anchors a batch of events to Stellar by committing a
 * deterministic hash (or Merkle root) of the event hashes to the
 * Soroban registry contract.
 *
 * For a single event, the commitment is:
 *   SHA-256(DOMAIN.CHECKPOINT_COMMITMENT + ":" + eventHash)
 *
 * For a batch, the commitment is the Merkle root of all event hashes
 * in ascending sequence order (see hashing.ts for leaf/node semantics).
 *
 * LIMITATION: Events created after the latest confirmed checkpoint are
 * not yet independently anchored. Never claim they are.
 */

import { PROTOCOL_VERSION, type Checkpoint, type SignedEvent } from "./types.js";
import {
  computeMerkleRoot,
  computeSingleEventCommitment,
  hashBytes,
} from "./hashing.js";
import { canonicalBytes } from "./canonicalize.js";

// ─── Checkpoint Construction ──────────────────────────────────────────────────

export interface BuildCheckpointOptions {
  organizationId: string;
  registryId: string;
  checkpointSequence: number;
  events: SignedEvent[];
  previousCheckpointCommitment: string;
  policyVersion: string;
  /** Override timestamp for testing. */
  timestampOverride?: string;
}

/**
 * Build a checkpoint from a batch of signed events.
 *
 * Events are sorted by sequence before computing the commitment.
 * At least one event is required.
 */
export function buildCheckpoint(options: BuildCheckpointOptions): Checkpoint {
  const {
    organizationId,
    registryId,
    checkpointSequence,
    events,
    previousCheckpointCommitment,
    policyVersion,
    timestampOverride,
  } = options;

  if (events.length === 0) {
    throw new Error("Cannot build checkpoint from empty event list");
  }

  if (checkpointSequence < 1) {
    throw new Error(
      `Checkpoint sequence must be >= 1, got: ${checkpointSequence}`
    );
  }
  if (checkpointSequence === 1 && previousCheckpointCommitment !== "") {
    throw new Error(
      "First checkpoint (sequence=1) must have previousCheckpointCommitment=''"
    );
  }
  if (checkpointSequence > 1 && previousCheckpointCommitment === "") {
    throw new Error(
      `Checkpoint sequence ${checkpointSequence} requires a non-empty previousCheckpointCommitment`
    );
  }

  // Sort events by sequence
  const sorted = [...events].sort((a, b) => a.sequence - b.sequence);

  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (!first || !last) throw new Error("No events after sorting");

  const eventSequenceStart = first.sequence;
  const eventSequenceEnd = last.sequence;

  // Compute batch commitment
  const eventHashes = sorted.map((e) => e.eventHash);
  const batchCommitment =
    eventHashes.length === 1 && eventHashes[0] !== undefined
      ? computeSingleEventCommitment(eventHashes[0])
      : computeMerkleRoot(eventHashes);

  // Build the checkpoint object (without the checkpointHash field)
  const partial: Omit<Checkpoint, "checkpointHash"> = {
    protocolVersion: PROTOCOL_VERSION,
    organizationId,
    registryId,
    checkpointSequence,
    eventSequenceStart,
    eventSequenceEnd,
    batchCommitment,
    previousCheckpointCommitment,
    policyVersion,
    claimedAt: timestampOverride ?? new Date().toISOString(),
  };

  // Compute the checkpointHash over the partial object
  const checkpointHash = hashBytes(canonicalBytes(partial));

  return { ...partial, checkpointHash };
}

/**
 * Verify that a checkpoint's checkpointHash matches its contents.
 * Returns true if valid.
 */
export function verifyCheckpointHash(checkpoint: Checkpoint): boolean {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { checkpointHash, ...partial } = checkpoint;
  const recomputed = hashBytes(canonicalBytes(partial));
  return recomputed === checkpointHash;
}

/**
 * Verify that a batch of events matches the checkpoint's batch commitment.
 *
 * Returns true if the events, when sorted by sequence and hashed per the
 * protocol rules, produce the commitment stored in the checkpoint.
 */
export function verifyBatchCommitment(
  events: SignedEvent[],
  checkpoint: Checkpoint
): boolean {
  if (events.length === 0) return false;

  const sorted = [...events].sort((a, b) => a.sequence - b.sequence);
  const eventHashes = sorted.map((e) => e.eventHash);

  const computed =
    eventHashes.length === 1 && eventHashes[0] !== undefined
      ? computeSingleEventCommitment(eventHashes[0])
      : computeMerkleRoot(eventHashes);

  return computed === checkpoint.batchCommitment;
}

/**
 * Verify the previous checkpoint link.
 * Returns true if the previous commitment matches or if this is the first checkpoint.
 */
export function verifyCheckpointChain(
  checkpoint: Checkpoint,
  previousCheckpoint: Checkpoint | undefined
): boolean {
  if (checkpoint.checkpointSequence === 1) {
    return checkpoint.previousCheckpointCommitment === "";
  }
  if (!previousCheckpoint) return false;
  return (
    checkpoint.previousCheckpointCommitment ===
    previousCheckpoint.checkpointHash
  );
}
