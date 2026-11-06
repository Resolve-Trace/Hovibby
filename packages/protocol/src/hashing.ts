/**
 * ResolveTrace hashing primitives.
 *
 * Uses SHA-256 from @noble/hashes — a well-audited, dependency-light library.
 * All hash functions in the protocol route through this module.
 *
 * Hash outputs are hex-encoded strings throughout the codebase.
 */

import { sha256 } from "@noble/hashes/sha256";
import {
  eventHashInput,
  payloadCommitmentInput,
  checkpointCommitmentInput,
  merkleLeafInput,
  merkleNodeInput,
} from "./canonicalize.js";
import type { UnsignedEvent } from "./types.js";

// ─── Utility ──────────────────────────────────────────────────────────────────

/** Convert a Uint8Array to a lowercase hex string. */
export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Convert a hex string to a Uint8Array. */
export function fromHex(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new Error(`Invalid hex string length: ${hex.length}`);
  }
  const result = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    result[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return result;
}

// ─── Core Hash Functions ──────────────────────────────────────────────────────

/**
 * Hash an arbitrary byte array with SHA-256.
 * Returns hex-encoded output.
 */
export function hashBytes(input: Uint8Array): string {
  return toHex(sha256(input));
}

/**
 * Compute the canonical event hash.
 *
 * event_hash = SHA-256(DOMAIN.EVENT_HASH + ":" + canonicalize(unsignedEvent))
 *
 * The UnsignedEvent must NOT include the signature field.
 */
export function computeEventHash(event: UnsignedEvent): string {
  return hashBytes(eventHashInput(event));
}

/**
 * Compute the payload commitment for a given payload object.
 *
 * payload_commitment = SHA-256(DOMAIN.PAYLOAD_COMMITMENT + ":" + canonicalize(payload))
 */
export function computePayloadCommitment(payload: unknown): string {
  return hashBytes(payloadCommitmentInput(payload));
}

/**
 * Compute the checkpoint commitment for a single event hash.
 *
 * commitment = SHA-256(DOMAIN.CHECKPOINT_COMMITMENT + ":" + eventHash)
 */
export function computeSingleEventCommitment(eventHash: string): string {
  return hashBytes(checkpointCommitmentInput(eventHash));
}

// ─── Merkle Tree ──────────────────────────────────────────────────────────────

/**
 * Compute the Merkle leaf hash for an event.
 *
 * leaf = SHA-256(DOMAIN.MERKLE_LEAF + ":" + eventHash)
 */
export function computeMerkleLeaf(eventHash: string): string {
  return hashBytes(merkleLeafInput(eventHash));
}

/**
 * Compute a Merkle internal node hash.
 *
 * node = SHA-256(DOMAIN.MERKLE_NODE + ":" + leftHash + rightHash)
 */
export function computeMerkleNode(left: string, right: string): string {
  return hashBytes(merkleNodeInput(left, right));
}

/**
 * Compute the Merkle root from an ordered list of event hashes.
 *
 * The tree is built bottom-up. If the number of leaves is odd,
 * the last leaf is duplicated — this is the standard behavior.
 * The specification documents this behavior explicitly.
 *
 * Returns the Merkle root as a hex string.
 * Returns an empty string for an empty input.
 */
export function computeMerkleRoot(eventHashes: string[]): string {
  if (eventHashes.length === 0) return "";
  if (eventHashes.length === 1) {
    const first = eventHashes[0];
    if (first === undefined) return "";
    return computeMerkleLeaf(first);
  }

  // Compute leaf hashes
  let layer = eventHashes.map(computeMerkleLeaf);

  // Build tree bottom-up
  while (layer.length > 1) {
    const nextLayer: string[] = [];
    for (let i = 0; i < layer.length; i += 2) {
      const left = layer[i];
      const right = i + 1 < layer.length ? layer[i + 1] : layer[i];
      if (left === undefined) throw new Error("Unexpected undefined in Merkle layer");
      if (right === undefined) throw new Error("Unexpected undefined in Merkle layer");
      nextLayer.push(computeMerkleNode(left, right));
    }
    layer = nextLayer;
  }

  const root = layer[0];
  if (root === undefined) throw new Error("Merkle root computation failed");
  return root;
}

export interface MerkleProof {
  /** Index of the leaf being proved (0-based). */
  leafIndex: number;
  /** Total number of leaves. */
  totalLeaves: number;
  /** Sibling hashes from leaf to root. */
  proof: Array<{ position: "left" | "right"; hash: string }>;
}

/**
 * Generate a Merkle inclusion proof for a specific event hash.
 * The eventHash is searched by value; its index is found automatically.
 *
 * Throws if the eventHash is not found in the list.
 */
export function generateMerkleProof(
  eventHashes: string[],
  targetEventHash: string
): MerkleProof {
  const leafIndex = eventHashes.indexOf(targetEventHash);
  if (leafIndex === -1) {
    throw new Error(
      `Event hash not found in batch: ${targetEventHash.slice(0, 16)}...`
    );
  }

  const totalLeaves = eventHashes.length;
  let layer = eventHashes.map(computeMerkleLeaf);
  let currentIndex = leafIndex;
  const proof: MerkleProof["proof"] = [];

  while (layer.length > 1) {
    const siblingIndex =
      currentIndex % 2 === 0 ? currentIndex + 1 : currentIndex - 1;
    const sibling =
      siblingIndex < layer.length
        ? layer[siblingIndex]
        : layer[currentIndex]; // duplicate if odd

    if (sibling === undefined) throw new Error("Unexpected undefined sibling");

    proof.push({
      position: currentIndex % 2 === 0 ? "right" : "left",
      hash: sibling,
    });

    const nextLayer: string[] = [];
    for (let i = 0; i < layer.length; i += 2) {
      const left = layer[i];
      const right = i + 1 < layer.length ? layer[i + 1] : layer[i];
      if (left === undefined || right === undefined)
        throw new Error("Unexpected undefined in Merkle layer");
      nextLayer.push(computeMerkleNode(left, right));
    }
    layer = nextLayer;
    currentIndex = Math.floor(currentIndex / 2);
  }

  return { leafIndex, totalLeaves, proof };
}

/**
 * Verify a Merkle inclusion proof.
 */
export function verifyMerkleProof(
  eventHash: string,
  proof: MerkleProof,
  expectedRoot: string
): boolean {
  let current = computeMerkleLeaf(eventHash);

  for (const step of proof.proof) {
    current =
      step.position === "right"
        ? computeMerkleNode(current, step.hash)
        : computeMerkleNode(step.hash, current);
  }

  return current === expectedRoot;
}
