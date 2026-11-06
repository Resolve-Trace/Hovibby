import { describe, it, expect, beforeAll } from "@jest/globals";
import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha512";
import {
  buildCheckpoint,
  verifyCheckpointHash,
  verifyBatchCommitment,
  verifyCheckpointChain,
} from "../checkpoint.js";
import {
  createUnsignedEvent,
  signEvent,
} from "../events.js";
import { EventType, ActorRole } from "../types.js";
import { toHex } from "../hashing.js";

beforeAll(() => {
  ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));
});

async function makeSignedEvent(
  seq: number,
  prevHash: string,
  privateKey: string,
  publicKey: string
) {
  const unsigned = createUnsignedEvent({
    organizationId: "org",
    workflowId: "wf",
    sequence: seq,
    eventType: EventType.CASE_CREATED,
    actorId: "alice",
    actorPublicKey: publicKey,
    actorRole: ActorRole.REPORTER,
    payload: { seq },
    policyVersion: "1.0.0",
    previousEventHash: prevHash,
  });
  return signEvent(unsigned, privateKey);
}

describe("buildCheckpoint", () => {
  it("builds a valid checkpoint from a single event", async () => {
    const privateKey = toHex(ed.utils.randomPrivateKey());
    const publicKey = toHex(await ed.getPublicKeyAsync(ed.etc.hexToBytes(privateKey)));

    const event = await makeSignedEvent(1, "", privateKey, publicKey);
    const cp = buildCheckpoint({
      organizationId: "org",
      registryId: "reg-1",
      checkpointSequence: 1,
      events: [event],
      previousCheckpointCommitment: "",
      policyVersion: "1.0.0",
    });

    expect(cp.checkpointSequence).toBe(1);
    expect(cp.eventSequenceStart).toBe(1);
    expect(cp.eventSequenceEnd).toBe(1);
    expect(cp.batchCommitment).toHaveLength(64);
    expect(cp.checkpointHash).toHaveLength(64);
    expect(cp.previousCheckpointCommitment).toBe("");
  });

  it("builds a valid checkpoint from multiple events", async () => {
    const privHex = toHex(ed.utils.randomPrivateKey());
    const pubHex = toHex(await ed.getPublicKeyAsync(ed.etc.hexToBytes(privHex)));

    const e1 = await makeSignedEvent(1, "", privHex, pubHex);
    const e2 = await makeSignedEvent(2, e1.eventHash, privHex, pubHex);
    const e3 = await makeSignedEvent(3, e2.eventHash, privHex, pubHex);

    const cp = buildCheckpoint({
      organizationId: "org",
      registryId: "reg-1",
      checkpointSequence: 1,
      events: [e1, e2, e3],
      previousCheckpointCommitment: "",
      policyVersion: "1.0.0",
    });

    expect(cp.eventSequenceStart).toBe(1);
    expect(cp.eventSequenceEnd).toBe(3);
  });

  it("throws for empty event list", () => {
    expect(() =>
      buildCheckpoint({
        organizationId: "org",
        registryId: "reg",
        checkpointSequence: 1,
        events: [],
        previousCheckpointCommitment: "",
        policyVersion: "1.0.0",
      })
    ).toThrow();
  });

  it("throws when sequence=1 has non-empty previous", async () => {
    const privHex = toHex(ed.utils.randomPrivateKey());
    const pubHex = toHex(await ed.getPublicKeyAsync(ed.etc.hexToBytes(privHex)));
    const e1 = await makeSignedEvent(1, "", privHex, pubHex);

    expect(() =>
      buildCheckpoint({
        organizationId: "org",
        registryId: "reg",
        checkpointSequence: 1,
        events: [e1],
        previousCheckpointCommitment: "cafebabe",
        policyVersion: "1.0.0",
      })
    ).toThrow();
  });
});

describe("verifyCheckpointHash", () => {
  it("passes for an unmodified checkpoint", async () => {
    const privHex = toHex(ed.utils.randomPrivateKey());
    const pubHex = toHex(await ed.getPublicKeyAsync(ed.etc.hexToBytes(privHex)));
    const e1 = await makeSignedEvent(1, "", privHex, pubHex);

    const cp = buildCheckpoint({
      organizationId: "org",
      registryId: "reg-1",
      checkpointSequence: 1,
      events: [e1],
      previousCheckpointCommitment: "",
      policyVersion: "1.0.0",
    });

    expect(verifyCheckpointHash(cp)).toBe(true);
  });

  it("fails when checkpoint is modified", async () => {
    const privHex = toHex(ed.utils.randomPrivateKey());
    const pubHex = toHex(await ed.getPublicKeyAsync(ed.etc.hexToBytes(privHex)));
    const e1 = await makeSignedEvent(1, "", privHex, pubHex);

    const cp = buildCheckpoint({
      organizationId: "org",
      registryId: "reg-1",
      checkpointSequence: 1,
      events: [e1],
      previousCheckpointCommitment: "",
      policyVersion: "1.0.0",
    });

    const tampered = { ...cp, organizationId: "attacker" };
    expect(verifyCheckpointHash(tampered)).toBe(false);
  });
});

describe("verifyBatchCommitment", () => {
  it("verifies a correct batch", async () => {
    const privHex = toHex(ed.utils.randomPrivateKey());
    const pubHex = toHex(await ed.getPublicKeyAsync(ed.etc.hexToBytes(privHex)));
    const e1 = await makeSignedEvent(1, "", privHex, pubHex);
    const e2 = await makeSignedEvent(2, e1.eventHash, privHex, pubHex);

    const cp = buildCheckpoint({
      organizationId: "org",
      registryId: "reg",
      checkpointSequence: 1,
      events: [e1, e2],
      previousCheckpointCommitment: "",
      policyVersion: "1.0.0",
    });

    expect(verifyBatchCommitment([e1, e2], cp)).toBe(true);
  });

  it("fails when an event is tampered", async () => {
    const privHex = toHex(ed.utils.randomPrivateKey());
    const pubHex = toHex(await ed.getPublicKeyAsync(ed.etc.hexToBytes(privHex)));
    const e1 = await makeSignedEvent(1, "", privHex, pubHex);
    const e2 = await makeSignedEvent(2, e1.eventHash, privHex, pubHex);

    const cp = buildCheckpoint({
      organizationId: "org",
      registryId: "reg",
      checkpointSequence: 1,
      events: [e1, e2],
      previousCheckpointCommitment: "",
      policyVersion: "1.0.0",
    });

    const tampered = { ...e1, eventHash: "deadbeef00000000deadbeef00000000deadbeef00000000deadbeef00000000" };
    expect(verifyBatchCommitment([tampered, e2], cp)).toBe(false);
  });
});

describe("verifyCheckpointChain", () => {
  it("first checkpoint passes with empty previous", async () => {
    const privHex = toHex(ed.utils.randomPrivateKey());
    const pubHex = toHex(await ed.getPublicKeyAsync(ed.etc.hexToBytes(privHex)));
    const e1 = await makeSignedEvent(1, "", privHex, pubHex);
    const cp = buildCheckpoint({
      organizationId: "org",
      registryId: "reg",
      checkpointSequence: 1,
      events: [e1],
      previousCheckpointCommitment: "",
      policyVersion: "1.0.0",
    });
    expect(verifyCheckpointChain(cp, undefined)).toBe(true);
  });

  it("second checkpoint passes with correct previous hash", async () => {
    const privHex = toHex(ed.utils.randomPrivateKey());
    const pubHex = toHex(await ed.getPublicKeyAsync(ed.etc.hexToBytes(privHex)));
    const e1 = await makeSignedEvent(1, "", privHex, pubHex);
    const cp1 = buildCheckpoint({
      organizationId: "org",
      registryId: "reg",
      checkpointSequence: 1,
      events: [e1],
      previousCheckpointCommitment: "",
      policyVersion: "1.0.0",
    });

    const e2 = await makeSignedEvent(2, e1.eventHash, privHex, pubHex);
    const cp2 = buildCheckpoint({
      organizationId: "org",
      registryId: "reg",
      checkpointSequence: 2,
      events: [e2],
      previousCheckpointCommitment: cp1.checkpointHash,
      policyVersion: "1.0.0",
    });

    expect(verifyCheckpointChain(cp2, cp1)).toBe(true);
  });

  it("fails when previous hash is wrong", async () => {
    const privHex = toHex(ed.utils.randomPrivateKey());
    const pubHex = toHex(await ed.getPublicKeyAsync(ed.etc.hexToBytes(privHex)));
    const e1 = await makeSignedEvent(1, "", privHex, pubHex);
    const cp1 = buildCheckpoint({
      organizationId: "org",
      registryId: "reg",
      checkpointSequence: 1,
      events: [e1],
      previousCheckpointCommitment: "",
      policyVersion: "1.0.0",
    });

    const e2 = await makeSignedEvent(2, e1.eventHash, privHex, pubHex);
    const cp2 = buildCheckpoint({
      organizationId: "org",
      registryId: "reg",
      checkpointSequence: 2,
      events: [e2],
      previousCheckpointCommitment: "wronghash" + "0".repeat(55),
      policyVersion: "1.0.0",
    });

    expect(verifyCheckpointChain(cp2, cp1)).toBe(false);
  });
});
