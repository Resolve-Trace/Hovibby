/**
 * ResolveTrace event construction and hash-chain management.
 *
 * The hash chain links each event to its predecessor:
 *   event_hash = SHA-256(DOMAIN.EVENT_HASH + ":" + canonicalize(unsignedEvent))
 *
 * where unsignedEvent.previousEventHash = hash of (sequence - 1).
 * The first event (sequence === 1) uses previousEventHash = "".
 *
 * LIMITATION: The hash chain detects unauthorized changes to committed events.
 * It does NOT prevent a malicious operator from:
 *   - Creating an alternative event history from scratch
 *   - Withholding events from a bundle
 * Independent parties keeping copies of public checkpoints help detect rollback.
 */

import { v4 as uuidv4 } from "uuid";
import {
  EventType,
  ActorRole,
  PROTOCOL_VERSION,
  type UnsignedEvent,
  type SignedEvent,
  type EventPayload,
} from "./types.js";
import {
  computeEventHash,
  computePayloadCommitment,
} from "./hashing.js";
import { signatureInput } from "./canonicalize.js";
import { fromHex, toHex } from "./hashing.js";

// @noble/ed25519 for Ed25519 signing/verification
import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha512";

// @noble/ed25519 v2 requires this shim in Node.js
ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));

// ─── Event Construction ───────────────────────────────────────────────────────

export interface CreateEventOptions {
  organizationId: string;
  workflowId: string;
  sequence: number;
  eventType: EventType;
  actorId: string;
  actorPublicKey?: string;
  actorRole: ActorRole;
  payload: EventPayload;
  policyVersion: string;
  previousEventHash: string;
  checkpointRef?: string;
  /** Override the timestamp (for testing). Defaults to current UTC time. */
  timestampOverride?: string;
}

/**
 * Create an UnsignedEvent with all protocol fields populated.
 * The caller is responsible for providing the correct previousEventHash.
 */
export function createUnsignedEvent(
  options: CreateEventOptions
): UnsignedEvent {
  const {
    organizationId,
    workflowId,
    sequence,
    eventType,
    actorId,
    actorPublicKey,
    actorRole,
    payload,
    policyVersion,
    previousEventHash,
    checkpointRef,
    timestampOverride,
  } = options;

  if (sequence < 1) {
    throw new Error(`Event sequence must be >= 1, got: ${sequence}`);
  }
  if (sequence === 1 && previousEventHash !== "") {
    throw new Error(
      "First event (sequence=1) must have previousEventHash = ''"
    );
  }
  if (sequence > 1 && previousEventHash === "") {
    throw new Error(
      `Event sequence ${sequence} requires a non-empty previousEventHash`
    );
  }

  const payloadCommitment = computePayloadCommitment(payload);

  const event: UnsignedEvent = {
    protocolVersion: PROTOCOL_VERSION,
    eventId: uuidv4(),
    organizationId,
    workflowId,
    sequence,
    eventType,
    actorId,
    actorRole,
    claimedAt: timestampOverride ?? new Date().toISOString(),
    previousEventHash,
    payloadCommitment,
    policyVersion,
  };

  if (actorPublicKey !== undefined) {
    event.actorPublicKey = actorPublicKey;
  }
  if (checkpointRef !== undefined) {
    event.checkpointRef = checkpointRef;
  }

  return event;
}

/**
 * Sign an UnsignedEvent with an Ed25519 private key.
 *
 * Signs: DOMAIN.SIGNATURE + ":" + eventHash
 *
 * SECURITY: The private key must never be passed from browser code,
 * stored in localStorage, or logged. Use a wallet abstraction for
 * on-chain operations.
 *
 * @param event - The unsigned event to sign.
 * @param privateKeyHex - 32-byte Ed25519 private key seed, hex-encoded.
 */
export async function signEvent(
  event: UnsignedEvent,
  privateKeyHex: string
): Promise<SignedEvent> {
  const eventHash = computeEventHash(event);
  const msgBytes = signatureInput(eventHash);
  const privateKeyBytes = fromHex(privateKeyHex);
  const signatureBytes = await ed.sign(msgBytes, privateKeyBytes);
  const signature = toHex(signatureBytes);

  return {
    ...event,
    eventHash,
    signature,
  };
}

/**
 * Synchronous variant of signEvent for environments where async is inconvenient.
 * Requires ed.etc.sha512Sync to be set (done in this module).
 */
export function signEventSync(
  event: UnsignedEvent,
  privateKeyHex: string
): SignedEvent {
  const eventHash = computeEventHash(event);
  const msgBytes = signatureInput(eventHash);
  const privateKeyBytes = fromHex(privateKeyHex);
  const signatureBytes = ed.sign(msgBytes, privateKeyBytes);
  const signature = toHex(signatureBytes as Uint8Array);

  return {
    ...event,
    eventHash,
    signature,
  };
}

/**
 * Verify an event's signature using the actor's public key.
 *
 * Returns true if the signature is valid, false otherwise.
 * Throws if the event is missing a signature or public key — the caller
 * should handle those as UNAUTHORIZED_ACTOR or INCOMPLETE_BUNDLE.
 */
export async function verifyEventSignature(
  event: SignedEvent
): Promise<boolean> {
  if (!event.actorPublicKey) {
    throw new Error(
      `Event ${event.eventId} has no actorPublicKey; cannot verify signature`
    );
  }
  if (!event.signature) {
    throw new Error(`Event ${event.eventId} has no signature`);
  }

  // Recompute the hash from the unsigned portion (must not include signature/eventHash)
  const unsigned: UnsignedEvent = extractUnsignedEvent(event);
  const recomputedHash = computeEventHash(unsigned);

  if (recomputedHash !== event.eventHash) {
    // The eventHash field has been tampered with or the event has been modified
    return false;
  }

  const msgBytes = signatureInput(recomputedHash);
  const signatureBytes = fromHex(event.signature);
  const publicKeyBytes = fromHex(event.actorPublicKey);

  try {
    return await ed.verify(signatureBytes, msgBytes, publicKeyBytes);
  } catch {
    return false;
  }
}

/**
 * Extract the UnsignedEvent portion from a SignedEvent.
 * This is the canonical data that was hashed and signed.
 */
export function extractUnsignedEvent(signed: SignedEvent): UnsignedEvent {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { signature, eventHash, ...unsigned } = signed;
  return unsigned;
}

// ─── Hash Chain ───────────────────────────────────────────────────────────────

/**
 * Validate that a sequence of signed events forms a valid hash chain.
 *
 * Checks:
 * 1. Events are in ascending sequence order starting at 1.
 * 2. No duplicate sequence numbers.
 * 3. Each event's previousEventHash matches the computed hash of the prior event.
 * 4. The first event has previousEventHash === "".
 * 5. Each event's eventHash matches the recomputed hash.
 *
 * Returns an array of error strings. Empty array = valid chain.
 */
export function validateHashChain(events: SignedEvent[]): string[] {
  const errors: string[] = [];

  if (events.length === 0) {
    return ["Hash chain is empty"];
  }

  // Sort by sequence
  const sorted = [...events].sort((a, b) => a.sequence - b.sequence);

  // First event must have sequence 1
  const first = sorted[0];
  if (!first) return ["No events"];

  if (first.sequence !== 1) {
    errors.push(
      `Expected first event sequence to be 1, got: ${first.sequence}`
    );
  }

  if (first.previousEventHash !== "") {
    errors.push(
      `First event (sequence=1, id=${first.eventId}) must have previousEventHash="", got: "${first.previousEventHash}"`
    );
  }

  // Validate each event's hash and chain link
  const seenSequences = new Set<number>();
  let previousHash = "";

  for (let i = 0; i < sorted.length; i++) {
    const event = sorted[i];
    if (!event) continue;

    // Duplicate check
    if (seenSequences.has(event.sequence)) {
      errors.push(`Duplicate sequence number: ${event.sequence}`);
      continue;
    }
    seenSequences.add(event.sequence);

    // Gap check
    if (i > 0) {
      const prev = sorted[i - 1];
      if (prev && event.sequence !== prev.sequence + 1) {
        errors.push(
          `Sequence gap between ${prev.sequence} and ${event.sequence}`
        );
      }
    }

    // Recompute hash
    const unsigned = extractUnsignedEvent(event);
    const recomputedHash = computeEventHash(unsigned);

    if (recomputedHash !== event.eventHash) {
      errors.push(
        `Event ${event.eventId} (seq=${event.sequence}): stored eventHash does not match recomputed hash. ` +
          `Expected: ${recomputedHash}, got: ${event.eventHash}`
      );
    }

    // Chain link check (skip for first event)
    if (i > 0) {
      if (event.previousEventHash !== previousHash) {
        errors.push(
          `Event ${event.eventId} (seq=${event.sequence}): previousEventHash mismatch. ` +
            `Expected: ${previousHash}, got: ${event.previousEventHash}`
        );
      }
    }

    previousHash = recomputedHash;
  }

  return errors;
}

/**
 * Get the public key for a given key ID.
 * For MVP, keys are resolved from the authorization evidence map in the bundle.
 */
export function resolvePublicKey(
  actorPublicKey: string | undefined,
  authorizationEvidence: Record<string, ActorRole[]>
): string | undefined {
  if (!actorPublicKey) return undefined;
  if (actorPublicKey in authorizationEvidence) return actorPublicKey;
  return undefined;
}
