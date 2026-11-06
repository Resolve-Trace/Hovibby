/**
 * ResolveTrace End-to-End Local Demo
 *
 * This script exercises the full protocol without a blockchain connection:
 *   1. Creates a case with a CASE_CREATED event
 *   2. Assigns the case
 *   3. Proposes a resolution
 *   4. Builds a checkpoint
 *   5. Exports a verification bundle
 *   6. Verifies the bundle offline
 *   7. Tampers with an event and confirms verification fails
 *   8. Restores the original and confirms verification passes again
 *
 * Run: node scripts/demo-e2e.mjs
 * Requires: packages built (npm run build or scripts/build-all.ps1)
 */

import { writeFile, mkdir, readFile, rm } from "fs/promises";
import { resolve } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

// Import built packages
const protocolUrl = pathToFileURL(join(root, "packages/protocol/dist/index.js")).href;
const { 
  createUnsignedEvent, signEvent, validateHashChain,
  buildCheckpoint, verifyBundle, VerificationStatus,
  EventType, ActorRole,
  DEFAULT_POLICY, PROTOCOL_VERSION,
  toHex,
} = await import(protocolUrl);

import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha512";
ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));

// ─── Key setup ────────────────────────────────────────────────────────────────

const reporterKey = ed.utils.randomPrivateKey();
const reporterPub = toHex(await ed.getPublicKeyAsync(reporterKey));
const reporterPriv = toHex(reporterKey);

const officerKey = ed.utils.randomPrivateKey();
const officerPub = toHex(await ed.getPublicKeyAsync(officerKey));
const officerPriv = toHex(officerKey);

console.log("=== ResolveTrace End-to-End Local Demo ===\n");
console.log(`Reporter public key: ${reporterPub.slice(0, 16)}...`);
console.log(`Officer  public key: ${officerPub.slice(0, 16)}...`);

// ─── Step 1: Create case ──────────────────────────────────────────────────────

const workflowId = "11111111-1111-4111-8111-111111111111";
const orgId = "demo-organization";
const policyVersion = DEFAULT_POLICY.version;

const payload1 = { title: "Service disruption on 2026-11-05", category: "service_failure", priority: "high" };

const event1 = createUnsignedEvent({
  organizationId: orgId,
  workflowId,
  sequence: 1,
  eventType: EventType.CASE_CREATED,
  actorId: "reporter-alice",
  actorPublicKey: reporterPub,
  actorRole: ActorRole.REPORTER,
  payload: payload1,
  policyVersion,
  previousEventHash: "",
  timestampOverride: "2026-11-05T10:00:00.000Z",
});

const signed1 = await signEvent(event1, reporterPriv);
console.log(`\n[1] CASE_CREATED  hash=${signed1.eventHash.slice(0,16)}... sig=${signed1.signature.slice(0,16)}...`);

// ─── Step 2: Assign case ──────────────────────────────────────────────────────

const payload2 = { officerId: "officer-bob", reason: "Assigned to complaints team" };

const event2 = createUnsignedEvent({
  organizationId: orgId,
  workflowId,
  sequence: 2,
  eventType: EventType.CASE_ASSIGNED,
  actorId: "admin-carol",
  actorPublicKey: officerPub,
  actorRole: ActorRole.ADMIN,
  payload: payload2,
  policyVersion,
  previousEventHash: signed1.eventHash,
  timestampOverride: "2026-11-05T10:30:00.000Z",
});

const signed2 = await signEvent(event2, officerPriv);
console.log(`[2] CASE_ASSIGNED  hash=${signed2.eventHash.slice(0,16)}... chain_ok=${signed2.previousEventHash === signed1.eventHash}`);

// ─── Step 3: Resolve case ─────────────────────────────────────────────────────

const payload3 = { resolution: "Confirmed outage. SLA credit issued.", outcome: "resolved" };

const event3 = createUnsignedEvent({
  organizationId: orgId,
  workflowId,
  sequence: 3,
  eventType: EventType.CASE_RESOLUTION_PROPOSED,
  actorId: "officer-bob",
  actorPublicKey: officerPub,
  actorRole: ActorRole.OFFICER,
  payload: payload3,
  policyVersion,
  previousEventHash: signed2.eventHash,
  timestampOverride: "2026-11-05T14:00:00.000Z",
});

const signed3 = await signEvent(event3, officerPriv);
console.log(`[3] RESOLUTION     hash=${signed3.eventHash.slice(0,16)}... chain_ok=${signed3.previousEventHash === signed2.eventHash}`);

const events = [signed1, signed2, signed3];

// ─── Step 4: Validate hash chain ──────────────────────────────────────────────

const chainErrors = validateHashChain(events);
console.log(`\nHash chain validation: ${chainErrors.length === 0 ? "PASS ✓" : "FAIL: " + chainErrors.join("; ")}`);

// ─── Step 5: Build checkpoint ─────────────────────────────────────────────────

const checkpoint = buildCheckpoint({
  organizationId: orgId,
  registryId: "demo-registry",
  checkpointSequence: 1,
  events,
  previousCheckpointCommitment: "",
  policyVersion,
  timestampOverride: "2026-11-05T15:00:00.000Z",
});

console.log(`\nCheckpoint built:`);
console.log(`  sequence:       ${checkpoint.checkpointSequence}`);
console.log(`  events:         ${checkpoint.eventSequenceStart}–${checkpoint.eventSequenceEnd}`);
console.log(`  commitment:     ${checkpoint.batchCommitment.slice(0,24)}...`);
console.log(`  checkpointHash: ${checkpoint.checkpointHash.slice(0,24)}...`);

// ─── Step 6: Export bundle ────────────────────────────────────────────────────

const bundle = {
  bundleVersion: 1,
  protocolVersion: PROTOCOL_VERSION,
  exportedAt: "2026-11-05T15:01:00.000Z",
  organizationId: orgId,
  workflowId,
  events,
  checkpoint,
  authorizationEvidence: {
    [reporterPub]: ["reporter"],
    [officerPub]: ["officer", "admin"],
  },
  policy: DEFAULT_POLICY,
};

// ─── Step 7: Verify bundle (should pass) ─────────────────────────────────────

console.log(`\n=== Verification (original bundle) ===`);
const result1 = await verifyBundle({ bundle });

console.log(`Status: ${result1.status}`);
console.log(`Summary: ${result1.summary}`);
if (result1.errors.length > 0) {
  console.log(`Errors: ${result1.errors.join("\n  ")}`);
}
if (result1.warnings.length > 0) {
  console.log(`Warnings (${result1.warnings.length}): ${result1.warnings[0]}`);
}

const pass1 = result1.status === VerificationStatus.VALID || result1.status === VerificationStatus.UNANCHORED_EVENTS;
console.log(`\nTest: original bundle verifies → ${pass1 ? "PASS ✓" : "FAIL ✗"}`);

// ─── Step 8: Tamper with an event ─────────────────────────────────────────────

console.log(`\n=== Verification (tampered bundle) ===`);
const tamperedEvents = [
  { ...signed1, actorId: "mallory-impersonator" },  // Changed actorId
  signed2,
  signed3,
];
const tamperedBundle = { ...bundle, events: tamperedEvents };
const result2 = await verifyBundle({ bundle: tamperedBundle });

console.log(`Status: ${result2.status}`);
const pass2 = result2.status !== VerificationStatus.VALID;
console.log(`Test: tampered bundle fails → ${pass2 ? "PASS ✓" : "FAIL ✗"}`);
if (result2.errors.length > 0) {
  console.log(`Error: ${result2.errors[0]}`);
}

// ─── Step 9: Restore and verify again ────────────────────────────────────────

console.log(`\n=== Verification (restored bundle) ===`);
const result3 = await verifyBundle({ bundle });
const pass3 = result3.status === VerificationStatus.VALID || result3.status === VerificationStatus.UNANCHORED_EVENTS;
console.log(`Status: ${result3.status}`);
console.log(`Test: restored bundle verifies again → ${pass3 ? "PASS ✓" : "FAIL ✗"}`);

// ─── Results ──────────────────────────────────────────────────────────────────

console.log("\n=== Summary ===");
const allPass = pass1 && pass2 && pass3 && chainErrors.length === 0;
console.log(`Chain validation:       ${chainErrors.length === 0 ? "PASS ✓" : "FAIL ✗"}`);
console.log(`Original verification:  ${pass1 ? "PASS ✓" : "FAIL ✗"}`);
console.log(`Tampered detection:     ${pass2 ? "PASS ✓" : "FAIL ✗"}`);
console.log(`Restored verification:  ${pass3 ? "PASS ✓" : "FAIL ✗"}`);
console.log(`\nOverall: ${allPass ? "ALL PASS ✓" : "SOME TESTS FAILED ✗"}`);

console.log("\nNote: On-chain verification is omitted (no contract deployed).");
console.log("Run: stellar contract build && stellar contract deploy to enable it.");

if (!allPass) process.exit(1);
