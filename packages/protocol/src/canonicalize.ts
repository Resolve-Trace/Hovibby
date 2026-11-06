/**
 * Canonical serialization for the ResolveTrace protocol.
 *
 * Implements RFC 8785 JSON Canonicalization Scheme (JCS):
 * - Object keys sorted lexicographically (recursive)
 * - No insignificant whitespace
 * - Produces a deterministic UTF-8 byte sequence
 *
 * This is a self-contained implementation that works in both Node.js
 * and browser environments. It does NOT depend on the `canonicalize`
 * npm package to avoid CommonJS/ESM interop issues in bundlers.
 *
 * All hash inputs MUST go through this module.
 */

import { DOMAIN, type UnsignedEvent } from "./types.js";

// ─── RFC 8785 JCS implementation ──────────────────────────────────────────────

/**
 * Serialize a value to its RFC 8785 canonical JSON string.
 * Sorts object keys lexicographically at all levels of nesting.
 */
function jcsSerialize(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";

  if (typeof value === "number") {
    if (!isFinite(value)) throw new Error("Non-finite numbers are not allowed in JCS");
    if (isNaN(value)) throw new Error("NaN is not allowed in JCS");
    return JSON.stringify(value);
  }

  if (typeof value === "string") return JSON.stringify(value);

  if (Array.isArray(value)) {
    return "[" + value.map(jcsSerialize).join(",") + "]";
  }

  if (typeof value === "object" && value !== null) {
    const obj = value as Record<string, unknown>;
    const sortedKeys = Object.keys(obj).sort();
    const pairs = sortedKeys
      .filter((k) => obj[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${jcsSerialize(obj[k])}`);
    return "{" + pairs.join(",") + "}";
  }

  // undefined, functions, symbols — omit
  return "null";
}

/**
 * Returns the canonical string representation of an object (RFC 8785 JCS).
 */
export function canonicalString(obj: unknown): string {
  return jcsSerialize(obj);
}

/**
 * Returns the canonical UTF-8 bytes of an object (RFC 8785 JCS).
 */
export function canonicalBytes(obj: unknown): Uint8Array {
  return new TextEncoder().encode(jcsSerialize(obj));
}

/**
 * Prepares the canonical bytes for an event hash:
 *   domain_bytes || canonical_event_bytes
 *
 * The domain separator prevents the event hash from being
 * confused with other hash types in the protocol.
 */
export function eventHashInput(event: UnsignedEvent): Uint8Array {
  const domainBytes = new TextEncoder().encode(DOMAIN.EVENT_HASH + ":");
  const eventBytes = canonicalBytes(event);
  const combined = new Uint8Array(domainBytes.length + eventBytes.length);
  combined.set(domainBytes, 0);
  combined.set(eventBytes, domainBytes.length);
  return combined;
}

/**
 * Prepares the canonical bytes for a payload commitment:
 *   domain_bytes || canonical_payload_bytes
 */
export function payloadCommitmentInput(payload: unknown): Uint8Array {
  const domainBytes = new TextEncoder().encode(DOMAIN.PAYLOAD_COMMITMENT + ":");
  const payloadBytes = canonicalBytes(payload);
  const combined = new Uint8Array(domainBytes.length + payloadBytes.length);
  combined.set(domainBytes, 0);
  combined.set(payloadBytes, domainBytes.length);
  return combined;
}

/**
 * Prepares the canonical bytes for a checkpoint commitment:
 *   domain_bytes || hex_event_hash_bytes
 */
export function checkpointCommitmentInput(hexEventHash: string): Uint8Array {
  const domainBytes = new TextEncoder().encode(
    DOMAIN.CHECKPOINT_COMMITMENT + ":"
  );
  const hashBytes = new TextEncoder().encode(hexEventHash);
  const combined = new Uint8Array(domainBytes.length + hashBytes.length);
  combined.set(domainBytes, 0);
  combined.set(hashBytes, domainBytes.length);
  return combined;
}

/**
 * Prepares the canonical bytes for a Merkle leaf:
 *   domain_bytes || hex_event_hash_bytes
 */
export function merkleLeafInput(hexEventHash: string): Uint8Array {
  const domainBytes = new TextEncoder().encode(DOMAIN.MERKLE_LEAF + ":");
  const hashBytes = new TextEncoder().encode(hexEventHash);
  const combined = new Uint8Array(domainBytes.length + hashBytes.length);
  combined.set(domainBytes, 0);
  combined.set(hashBytes, domainBytes.length);
  return combined;
}

/**
 * Prepares the canonical bytes for a Merkle internal node:
 *   domain_bytes || left_hash_bytes || right_hash_bytes
 */
export function merkleNodeInput(
  leftHex: string,
  rightHex: string
): Uint8Array {
  const domainBytes = new TextEncoder().encode(DOMAIN.MERKLE_NODE + ":");
  const leftBytes = new TextEncoder().encode(leftHex);
  const rightBytes = new TextEncoder().encode(rightHex);
  const combined = new Uint8Array(
    domainBytes.length + leftBytes.length + rightBytes.length
  );
  combined.set(domainBytes, 0);
  combined.set(leftBytes, domainBytes.length);
  combined.set(rightBytes, domainBytes.length + leftBytes.length);
  return combined;
}

/**
 * Prepares the bytes to sign:
 *   domain_bytes || event_hash_bytes
 */
export function signatureInput(hexEventHash: string): Uint8Array {
  const domainBytes = new TextEncoder().encode(DOMAIN.SIGNATURE + ":");
  const hashBytes = new TextEncoder().encode(hexEventHash);
  const combined = new Uint8Array(domainBytes.length + hashBytes.length);
  combined.set(domainBytes, 0);
  combined.set(hashBytes, domainBytes.length);
  return combined;
}
