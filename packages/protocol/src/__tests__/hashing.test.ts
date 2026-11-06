import { describe, it, expect } from "@jest/globals";
import {
  computeEventHash,
  computePayloadCommitment,
  computeMerkleRoot,
  computeMerkleLeaf,
  computeMerkleNode,
  generateMerkleProof,
  verifyMerkleProof,
  toHex,
  fromHex,
} from "../hashing.js";
import { EventType, ActorRole, PROTOCOL_VERSION, type UnsignedEvent } from "../types.js";

const sampleEvent: UnsignedEvent = {
  protocolVersion: PROTOCOL_VERSION,
  eventId: "00000000-0000-0000-0000-000000000001",
  organizationId: "org-test",
  workflowId: "wf-001",
  sequence: 1,
  eventType: EventType.CASE_CREATED,
  actorId: "actor-1",
  actorPublicKey: "aabbcc",
  actorRole: ActorRole.REPORTER,
  claimedAt: "2024-01-01T00:00:00.000Z",
  previousEventHash: "",
  payloadCommitment: "deadbeef",
  policyVersion: "1.0.0",
};

describe("hashing", () => {
  describe("toHex / fromHex", () => {
    it("round-trips correctly", () => {
      const bytes = new Uint8Array([0, 1, 127, 128, 255]);
      expect(fromHex(toHex(bytes))).toEqual(bytes);
    });

    it("throws on odd-length hex", () => {
      expect(() => fromHex("abc")).toThrow();
    });
  });

  describe("computeEventHash", () => {
    it("produces a 64-char hex string", () => {
      const h = computeEventHash(sampleEvent);
      expect(h).toHaveLength(64);
      expect(h).toMatch(/^[0-9a-f]+$/);
    });

    it("is deterministic for identical inputs", () => {
      expect(computeEventHash(sampleEvent)).toBe(computeEventHash(sampleEvent));
    });

    it("changes when any field changes", () => {
      const h1 = computeEventHash(sampleEvent);
      const h2 = computeEventHash({ ...sampleEvent, sequence: 2, previousEventHash: "cafebabe" });
      const h3 = computeEventHash({ ...sampleEvent, actorId: "actor-2" });
      expect(h1).not.toBe(h2);
      expect(h1).not.toBe(h3);
    });

    it("changes when payload commitment changes", () => {
      const h1 = computeEventHash(sampleEvent);
      const h2 = computeEventHash({ ...sampleEvent, payloadCommitment: "00000000" });
      expect(h1).not.toBe(h2);
    });
  });

  describe("computePayloadCommitment", () => {
    it("is deterministic", () => {
      const payload = { title: "Test", description: "Hello" };
      expect(computePayloadCommitment(payload)).toBe(computePayloadCommitment(payload));
    });

    it("is key-order-independent (canonical)", () => {
      const p1 = { a: 1, b: 2 };
      const p2 = { b: 2, a: 1 };
      expect(computePayloadCommitment(p1)).toBe(computePayloadCommitment(p2));
    });

    it("changes when payload changes", () => {
      expect(computePayloadCommitment({ x: 1 })).not.toBe(
        computePayloadCommitment({ x: 2 })
      );
    });
  });

  describe("Merkle tree", () => {
    it("single event produces a leaf hash", () => {
      const hashes = ["aabbcc"];
      const root = computeMerkleRoot(hashes);
      expect(root).toBe(computeMerkleLeaf("aabbcc"));
    });

    it("two events produce a node hash", () => {
      const h1 = "aa";
      const h2 = "bb";
      const root = computeMerkleRoot([h1, h2]);
      expect(root).toBe(computeMerkleNode(computeMerkleLeaf(h1), computeMerkleLeaf(h2)));
    });

    it("is deterministic", () => {
      const hashes = ["a", "b", "c", "d"];
      expect(computeMerkleRoot(hashes)).toBe(computeMerkleRoot(hashes));
    });

    it("different order produces different root", () => {
      expect(computeMerkleRoot(["a", "b"])).not.toBe(computeMerkleRoot(["b", "a"]));
    });

    it("empty list returns empty string", () => {
      expect(computeMerkleRoot([])).toBe("");
    });

    it("Merkle proof verifies correctly for 4-leaf tree", () => {
      const hashes = ["a", "b", "c", "d"];
      const root = computeMerkleRoot(hashes);
      for (const h of hashes) {
        const proof = generateMerkleProof(hashes, h);
        expect(verifyMerkleProof(h, proof, root)).toBe(true);
      }
    });

    it("Merkle proof fails for wrong root", () => {
      const hashes = ["a", "b", "c"];
      const root = computeMerkleRoot(hashes);
      const proof = generateMerkleProof(hashes, "a");
      expect(verifyMerkleProof("a", proof, root + "00")).toBe(false);
    });

    it("Merkle proof fails for tampered event", () => {
      const hashes = ["a", "b", "c"];
      const root = computeMerkleRoot(hashes);
      const proof = generateMerkleProof(hashes, "a");
      // Use 'b' as the event but 'a's proof
      expect(verifyMerkleProof("b", proof, root)).toBe(false);
    });

    it("throws when event not in list", () => {
      expect(() => generateMerkleProof(["a", "b"], "z")).toThrow();
    });
  });
});
