/**
 * SDK workflow integration tests.
 *
 * Tests the full create → advance → checkpoint → verify flow
 * using the filesystem storage adapter and real protocol code.
 * Does NOT require a network connection or deployed contract.
 */

import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha512";

import {
  createCase,
  advanceWorkflow,
  buildCaseCheckpoint,
  exportVerificationBundle,
  verifyCase,
} from "../workflow.js";
import { FilesystemCaseStore } from "@resolvetrace/storage";
import {
  EventType,
  ActorRole,
  CaseCategory,
  CasePriority,
  VerificationStatus,
  toHex,
  validateHashChain,
} from "@resolvetrace/protocol";

// Set sha512Sync for @noble/ed25519 v2
ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));

async function makeKeyPair() {
  const priv = ed.utils.randomPrivateKey();
  const pub = await ed.getPublicKeyAsync(priv);
  return { privateHex: toHex(priv), publicHex: toHex(pub) };
}

let tmpDir: string;
let store: FilesystemCaseStore;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "rt-sdk-test-"));
  store = new FilesystemCaseStore({ type: "filesystem", basePath: tmpDir });
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe("createCase", () => {
  it("creates a case with a signed CASE_CREATED event", async () => {
    const { privateHex, publicHex } = await makeKeyPair();

    const { caseId, workflowId, event } = await createCase(store, {
      organizationId: "test-org",
      registryId: "test-registry",
      title: "Service complaint",
      category: CaseCategory.COMPLAINT,
      priority: CasePriority.MEDIUM,
      description: "A test complaint",
      reporterRef: "alice@example.com",
      reporterPublicKey: publicHex,
      signingKeyHex: privateHex,
    });

    expect(caseId).toBeTruthy();
    expect(workflowId).toBeTruthy();
    expect(event.eventType).toBe(EventType.CASE_CREATED);
    expect(event.actorRole).toBe(ActorRole.REPORTER);
    expect(event.signature).toBeTruthy();
    expect(event.eventHash).toHaveLength(64);
    expect(event.sequence).toBe(1);
    expect(event.previousEventHash).toBe("");

    // Verify the case was saved
    const doc = await store.getCase(caseId);
    expect(doc).not.toBeNull();
    expect(doc?.status).toBe("submitted");
    expect(doc?.title).toBe("Service complaint");
  });

  it("stores the event in the events log", async () => {
    const { privateHex } = await makeKeyPair();
    const { caseId } = await createCase(store, {
      organizationId: "org",
      registryId: "reg",
      title: "Test",
      category: CaseCategory.OTHER,
      priority: CasePriority.LOW,
      description: "Test",
      reporterRef: "bob",
      signingKeyHex: privateHex,
    });

    const events = await store.getEvents(caseId);
    expect(events).toHaveLength(1);
    expect(events[0]?.eventType).toBe(EventType.CASE_CREATED);
  });
});

describe("advanceWorkflow", () => {
  it("creates a valid event chain through submission → assignment → investigation", async () => {
    const reporterKeys = await makeKeyPair();
    const adminKeys = await makeKeyPair();
    const officerKeys = await makeKeyPair();

    // Create case
    const { caseId } = await createCase(store, {
      organizationId: "org",
      registryId: "reg",
      title: "Chain test",
      category: CaseCategory.COMPLAINT,
      priority: CasePriority.HIGH,
      description: "desc",
      reporterRef: "alice",
      reporterPublicKey: reporterKeys.publicHex,
      signingKeyHex: reporterKeys.privateHex,
    });

    // Assign
    const assignEvent = await advanceWorkflow(store, {
      caseId,
      actorId: "admin-carol",
      actorRole: ActorRole.ADMIN,
      actorPublicKey: adminKeys.publicHex,
      eventType: EventType.CASE_ASSIGNED,
      payload: { officerId: "officer-bob" },
      signingKeyHex: adminKeys.privateHex,
    });

    expect(assignEvent.sequence).toBe(2);
    expect(assignEvent.eventType).toBe(EventType.CASE_ASSIGNED);

    // Acknowledge
    const ackEvent = await advanceWorkflow(store, {
      caseId,
      actorId: "officer-bob",
      actorRole: ActorRole.OFFICER,
      actorPublicKey: officerKeys.publicHex,
      eventType: EventType.CASE_ACKNOWLEDGED,
      payload: {},
      signingKeyHex: officerKeys.privateHex,
    });

    expect(ackEvent.sequence).toBe(3);
    expect(ackEvent.eventType).toBe(EventType.CASE_ACKNOWLEDGED);

    // Validate hash chain
    const allEvents = await store.getEvents(caseId);
    expect(allEvents).toHaveLength(3);
    const errors = validateHashChain(allEvents);
    expect(errors).toEqual([]);
  });

  it("rejects invalid policy transitions", async () => {
    const reporterKeys = await makeKeyPair();

    const { caseId } = await createCase(store, {
      organizationId: "org",
      registryId: "reg",
      title: "Policy test",
      category: CaseCategory.COMPLAINT,
      priority: CasePriority.MEDIUM,
      description: "desc",
      reporterRef: "alice",
      signingKeyHex: reporterKeys.privateHex,
    });

    // REPORTER trying to submit CASE_ASSIGNED — invalid
    await expect(
      advanceWorkflow(store, {
        caseId,
        actorId: "alice",
        actorRole: ActorRole.REPORTER,
        eventType: EventType.CASE_ASSIGNED,
        payload: { officerId: "bob" },
        signingKeyHex: reporterKeys.privateHex,
      })
    ).rejects.toThrow(/Policy violation/);
  });
});

describe("buildCaseCheckpoint + verify", () => {
  it("builds a checkpoint and verifies the bundle as VALID", async () => {
    const reporterKeys = await makeKeyPair();
    const adminKeys = await makeKeyPair();

    // Create and advance case
    const { caseId } = await createCase(store, {
      organizationId: "org",
      registryId: "reg",
      title: "Checkpoint test",
      category: CaseCategory.COMPLAINT,
      priority: CasePriority.HIGH,
      description: "desc",
      reporterRef: "alice",
      reporterPublicKey: reporterKeys.publicHex,
      signingKeyHex: reporterKeys.privateHex,
    });

    await advanceWorkflow(store, {
      caseId,
      actorId: "admin-carol",
      actorRole: ActorRole.ADMIN,
      actorPublicKey: adminKeys.publicHex,
      eventType: EventType.CASE_ASSIGNED,
      payload: { officerId: "officer-bob" },
      signingKeyHex: adminKeys.privateHex,
    });

    // Build checkpoint
    const checkpoint = await buildCaseCheckpoint(store, caseId);
    expect(checkpoint.checkpointSequence).toBe(1);
    expect(checkpoint.eventSequenceStart).toBe(1);
    expect(checkpoint.eventSequenceEnd).toBe(2);
    expect(checkpoint.batchCommitment).toHaveLength(64);

    // Export and verify bundle
    const bundle = await exportVerificationBundle(store, caseId);
    expect(bundle.events).toHaveLength(2);
    expect(bundle.checkpoint).toBeDefined();

    const result = await verifyCase(bundle);
    expect(result.status).toBe(VerificationStatus.VALID);
    expect(result.verifiedEvents).toHaveLength(2);
    expect(result.verifiedEvents.every((e) => e.hashValid)).toBe(true);
    expect(result.verifiedEvents.every((e) => e.chainLinkValid)).toBe(true);
    expect(result.verifiedEvents.every((e) => e.signatureValid === true)).toBe(true);
    expect(result.checkpointResult?.localCommitmentValid).toBe(true);
  });

  it("detects a tampered event as BROKEN_HASH_CHAIN", async () => {
    const reporterKeys = await makeKeyPair();

    const { caseId } = await createCase(store, {
      organizationId: "org",
      registryId: "reg",
      title: "Tamper test",
      category: CaseCategory.COMPLAINT,
      priority: CasePriority.HIGH,
      description: "desc",
      reporterRef: "alice",
      reporterPublicKey: reporterKeys.publicHex,
      signingKeyHex: reporterKeys.privateHex,
    });

    await buildCaseCheckpoint(store, caseId);
    const bundle = await exportVerificationBundle(store, caseId);

    // Tamper with the event
    const tampered = {
      ...bundle,
      events: [{ ...bundle.events[0]!, actorId: "mallory" }],
    };

    const result = await verifyCase(tampered);
    expect(result.status).toBe(VerificationStatus.BROKEN_HASH_CHAIN);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("detects checkpoint mismatch when event hashes change", async () => {
    const reporterKeys = await makeKeyPair();

    const { caseId } = await createCase(store, {
      organizationId: "org",
      registryId: "reg",
      title: "Mismatch test",
      category: CaseCategory.COMPLAINT,
      priority: CasePriority.MEDIUM,
      description: "desc",
      reporterRef: "alice",
      reporterPublicKey: reporterKeys.publicHex,
      signingKeyHex: reporterKeys.privateHex,
    });

    await buildCaseCheckpoint(store, caseId);
    const bundle = await exportVerificationBundle(store, caseId);

    // Change the eventHash directly but keep the checkpoint intact
    const mismatch = {
      ...bundle,
      events: [
        {
          ...bundle.events[0]!,
          eventHash: "0".repeat(64), // Wrong hash
        },
      ],
    };

    const result = await verifyCase(mismatch);
    // Should detect both broken chain and checkpoint mismatch
    expect(result.status).not.toBe(VerificationStatus.VALID);
  });
});

describe("multiple checkpoints", () => {
  it("correctly chains two checkpoints", async () => {
    const keys = await makeKeyPair();
    const adminKeys = await makeKeyPair();

    const { caseId } = await createCase(store, {
      organizationId: "org",
      registryId: "reg",
      title: "Multi checkpoint",
      category: CaseCategory.COMPLAINT,
      priority: CasePriority.HIGH,
      description: "desc",
      reporterRef: "alice",
      reporterPublicKey: keys.publicHex,
      signingKeyHex: keys.privateHex,
    });

    // First checkpoint
    const cp1 = await buildCaseCheckpoint(store, caseId);
    expect(cp1.checkpointSequence).toBe(1);
    expect(cp1.previousCheckpointCommitment).toBe("");

    // Add another event
    await advanceWorkflow(store, {
      caseId,
      actorId: "admin",
      actorRole: ActorRole.ADMIN,
      actorPublicKey: adminKeys.publicHex,
      eventType: EventType.CASE_ASSIGNED,
      payload: { officerId: "bob" },
      signingKeyHex: adminKeys.privateHex,
    });

    // Second checkpoint
    const cp2 = await buildCaseCheckpoint(store, caseId);
    expect(cp2.checkpointSequence).toBe(2);
    expect(cp2.previousCheckpointCommitment).toBe(cp1.checkpointHash);
  });
});
