import { describe, it, expect, beforeAll } from "@jest/globals";
import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha512";
import {
  createUnsignedEvent,
  signEvent,
  verifyEventSignature,
  validateHashChain,
} from "../events.js";
import { EventType, ActorRole, PROTOCOL_VERSION } from "../types.js";
import { toHex } from "../hashing.js";
import { computePayloadCommitment } from "../hashing.js";

// Set sha512Sync for @noble/ed25519 v2
beforeAll(() => {
  ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));
});

async function generateKeyPair() {
  const privateKey = ed.utils.randomPrivateKey();
  const publicKey = await ed.getPublicKeyAsync(privateKey);
  return { privateKey: toHex(privateKey), publicKey: toHex(publicKey) };
}

describe("createUnsignedEvent", () => {
  it("creates a valid first event", () => {
    const payload = { title: "Test case", description: "A complaint" };
    const payloadCommitment = computePayloadCommitment(payload);

    const event = createUnsignedEvent({
      organizationId: "org-1",
      workflowId: "wf-1",
      sequence: 1,
      eventType: EventType.CASE_CREATED,
      actorId: "alice",
      actorRole: ActorRole.REPORTER,
      payload,
      policyVersion: "1.0.0",
      previousEventHash: "",
    });

    expect(event.protocolVersion).toBe(PROTOCOL_VERSION);
    expect(event.sequence).toBe(1);
    expect(event.previousEventHash).toBe("");
    expect(event.payloadCommitment).toBe(payloadCommitment);
    expect(event.eventId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  });

  it("throws for sequence < 1", () => {
    expect(() =>
      createUnsignedEvent({
        organizationId: "org",
        workflowId: "wf",
        sequence: 0,
        eventType: EventType.CASE_CREATED,
        actorId: "alice",
        actorRole: ActorRole.REPORTER,
        payload: {},
        policyVersion: "1.0.0",
        previousEventHash: "",
      })
    ).toThrow();
  });

  it("throws if sequence=1 but previousEventHash is non-empty", () => {
    expect(() =>
      createUnsignedEvent({
        organizationId: "org",
        workflowId: "wf",
        sequence: 1,
        eventType: EventType.CASE_CREATED,
        actorId: "alice",
        actorRole: ActorRole.REPORTER,
        payload: {},
        policyVersion: "1.0.0",
        previousEventHash: "deadbeef",
      })
    ).toThrow();
  });

  it("throws if sequence>1 but previousEventHash is empty", () => {
    expect(() =>
      createUnsignedEvent({
        organizationId: "org",
        workflowId: "wf",
        sequence: 2,
        eventType: EventType.CASE_ASSIGNED,
        actorId: "admin",
        actorRole: ActorRole.ADMIN,
        payload: {},
        policyVersion: "1.0.0",
        previousEventHash: "",
      })
    ).toThrow();
  });
});

describe("signEvent and verifyEventSignature", () => {
  it("signs and verifies correctly", async () => {
    const { privateKey, publicKey } = await generateKeyPair();

    const event = createUnsignedEvent({
      organizationId: "org",
      workflowId: "wf",
      sequence: 1,
      eventType: EventType.CASE_CREATED,
      actorId: "alice",
      actorPublicKey: publicKey,
      actorRole: ActorRole.REPORTER,
      payload: { title: "Hello" },
      policyVersion: "1.0.0",
      previousEventHash: "",
    });

    const signed = await signEvent(event, privateKey);
    expect(signed.signature).toBeTruthy();
    expect(signed.eventHash).toHaveLength(64);

    const valid = await verifyEventSignature(signed);
    expect(valid).toBe(true);
  });

  it("fails verification with wrong public key", async () => {
    const { privateKey } = await generateKeyPair();
    const { publicKey: wrongKey } = await generateKeyPair();

    const event = createUnsignedEvent({
      organizationId: "org",
      workflowId: "wf",
      sequence: 1,
      eventType: EventType.CASE_CREATED,
      actorId: "alice",
      actorPublicKey: wrongKey,
      actorRole: ActorRole.REPORTER,
      payload: { title: "Hello" },
      policyVersion: "1.0.0",
      previousEventHash: "",
    });

    const signed = await signEvent(event, privateKey);
    const valid = await verifyEventSignature(signed);
    expect(valid).toBe(false);
  });

  it("fails verification when event content is altered", async () => {
    const { privateKey, publicKey } = await generateKeyPair();

    const event = createUnsignedEvent({
      organizationId: "org",
      workflowId: "wf",
      sequence: 1,
      eventType: EventType.CASE_CREATED,
      actorId: "alice",
      actorPublicKey: publicKey,
      actorRole: ActorRole.REPORTER,
      payload: { title: "Hello" },
      policyVersion: "1.0.0",
      previousEventHash: "",
    });

    const signed = await signEvent(event, privateKey);
    // Tamper with the event
    const tampered = { ...signed, actorId: "mallory" };
    const valid = await verifyEventSignature(tampered);
    expect(valid).toBe(false);
  });

  it("throws when signature is missing", async () => {
    const { privateKey, publicKey } = await generateKeyPair();
    const event = createUnsignedEvent({
      organizationId: "org",
      workflowId: "wf",
      sequence: 1,
      eventType: EventType.CASE_CREATED,
      actorId: "alice",
      actorPublicKey: publicKey,
      actorRole: ActorRole.REPORTER,
      payload: {},
      policyVersion: "1.0.0",
      previousEventHash: "",
    });
    const signed = await signEvent(event, privateKey);
    // @ts-expect-error — intentionally remove signature for test
    delete signed.signature;
    await expect(verifyEventSignature(signed)).rejects.toThrow();
  });

  it("throws when public key is missing", async () => {
    const { privateKey } = await generateKeyPair();
    const event = createUnsignedEvent({
      organizationId: "org",
      workflowId: "wf",
      sequence: 1,
      eventType: EventType.CASE_CREATED,
      actorId: "alice",
      actorRole: ActorRole.REPORTER,
      payload: {},
      policyVersion: "1.0.0",
      previousEventHash: "",
    });
    const signed = await signEvent(event, privateKey);
    await expect(verifyEventSignature(signed)).rejects.toThrow();
  });
});

describe("validateHashChain", () => {
  async function buildChain(length: number) {
    const { privateKey, publicKey } = await generateKeyPair();
    const events = [];
    let prevHash = "";

    for (let i = 1; i <= length; i++) {
      const unsigned = createUnsignedEvent({
        organizationId: "org",
        workflowId: "wf",
        sequence: i,
        eventType: EventType.CASE_CREATED,
        actorId: "alice",
        actorPublicKey: publicKey,
        actorRole: ActorRole.REPORTER,
        payload: { index: i },
        policyVersion: "1.0.0",
        previousEventHash: prevHash,
      });
      const signed = await signEvent(unsigned, privateKey);
      prevHash = signed.eventHash;
      events.push(signed);
    }
    return events;
  }

  it("validates a correct chain of 1", async () => {
    const events = await buildChain(1);
    expect(validateHashChain(events)).toEqual([]);
  });

  it("validates a correct chain of 5", async () => {
    const events = await buildChain(5);
    expect(validateHashChain(events)).toEqual([]);
  });

  it("detects a modified event", async () => {
    const events = await buildChain(3);
    // Tamper with middle event's actorId — this changes its hash
    const tampered = events.map((e, i) =>
      i === 1 ? { ...e, actorId: "mallory" } : e
    );
    const errors = validateHashChain(tampered);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("detects a broken chain link", async () => {
    const events = await buildChain(3);
    // Set wrong previousEventHash on event 3
    const broken = events.map((e, i) =>
      i === 2 ? { ...e, previousEventHash: "000000" } : e
    );
    const errors = validateHashChain(broken);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("detects duplicate sequence numbers", async () => {
    const events = await buildChain(2);
    const dup = [events[0]!, { ...events[1]!, sequence: 1 }];
    const errors = validateHashChain(dup);
    expect(errors.some((e) => e.includes("Duplicate"))).toBe(true);
  });

  it("rejects empty chain", () => {
    const errors = validateHashChain([]);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("rejects chain not starting at sequence 1", async () => {
    const events = await buildChain(2);
    const shifted = events.map((e) => ({ ...e, sequence: e.sequence + 1 }));
    const errors = validateHashChain(shifted);
    expect(errors.length).toBeGreaterThan(0);
  });
});
