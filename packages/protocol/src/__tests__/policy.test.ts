import { describe, it, expect } from "@jest/globals";
import {
  validatePolicyTransition,
  getNextStatus,
  requiresAnchoring,
  isOverdue,
  DEFAULT_POLICY,
  validatePolicy,
} from "../policy.js";
import {
  CaseStatus,
  ActorRole,
  EventType,
  PROTOCOL_VERSION,
  type UnsignedEvent,
} from "../types.js";

function makeEvent(overrides: Partial<UnsignedEvent> = {}): UnsignedEvent {
  return {
    protocolVersion: PROTOCOL_VERSION,
    eventId: "00000000-0000-0000-0000-000000000001",
    organizationId: "org",
    workflowId: "wf",
    sequence: 1,
    eventType: EventType.CASE_CREATED,
    actorId: "alice",
    actorRole: ActorRole.REPORTER,
    claimedAt: "2024-01-01T00:00:00.000Z",
    previousEventHash: "",
    payloadCommitment: "abc",
    policyVersion: "1.0.0",
    ...overrides,
  };
}

describe("validatePolicyTransition", () => {
  it("allows CASE_CREATED from no status by REPORTER", () => {
    const result = validatePolicyTransition(
      DEFAULT_POLICY,
      undefined,
      makeEvent({ eventType: EventType.CASE_CREATED, actorRole: ActorRole.REPORTER })
    );
    expect(result.valid).toBe(true);
  });

  it("allows CASE_ASSIGNED from SUBMITTED by ADMIN", () => {
    const result = validatePolicyTransition(
      DEFAULT_POLICY,
      CaseStatus.SUBMITTED,
      makeEvent({ eventType: EventType.CASE_ASSIGNED, actorRole: ActorRole.ADMIN, sequence: 2, previousEventHash: "xx" })
    );
    expect(result.valid).toBe(true);
  });

  it("rejects CASE_ASSIGNED from SUBMITTED by REPORTER", () => {
    const result = validatePolicyTransition(
      DEFAULT_POLICY,
      CaseStatus.SUBMITTED,
      makeEvent({ eventType: EventType.CASE_ASSIGNED, actorRole: ActorRole.REPORTER, sequence: 2, previousEventHash: "xx" })
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("not authorized"))).toBe(true);
  });

  it("rejects invalid state transition (CLOSED → ASSIGNED)", () => {
    const result = validatePolicyTransition(
      DEFAULT_POLICY,
      CaseStatus.CLOSED,
      makeEvent({ eventType: EventType.CASE_ASSIGNED, actorRole: ActorRole.ADMIN, sequence: 2, previousEventHash: "xx" })
    );
    expect(result.valid).toBe(false);
  });

  it("requires reason for CASE_ESCALATED", () => {
    const result = validatePolicyTransition(
      DEFAULT_POLICY,
      CaseStatus.SUBMITTED,
      makeEvent({ eventType: EventType.CASE_ESCALATED, actorRole: ActorRole.ADMIN, sequence: 2, previousEventHash: "xx" }),
      "" // no reason
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("reason"))).toBe(true);
  });

  it("passes with reason for CASE_ESCALATED", () => {
    const result = validatePolicyTransition(
      DEFAULT_POLICY,
      CaseStatus.SUBMITTED,
      makeEvent({ eventType: EventType.CASE_ESCALATED, actorRole: ActorRole.ADMIN, sequence: 2, previousEventHash: "xx" }),
      "Overdue by 5 days"
    );
    expect(result.valid).toBe(true);
  });
});

describe("getNextStatus", () => {
  it("returns SUBMITTED for CASE_CREATED with no current status", () => {
    expect(getNextStatus(DEFAULT_POLICY, undefined, EventType.CASE_CREATED)).toBe(CaseStatus.SUBMITTED);
  });

  it("returns ASSIGNED for CASE_ASSIGNED from SUBMITTED", () => {
    expect(getNextStatus(DEFAULT_POLICY, CaseStatus.SUBMITTED, EventType.CASE_ASSIGNED)).toBe(CaseStatus.ASSIGNED);
  });

  it("returns undefined for invalid transition", () => {
    expect(getNextStatus(DEFAULT_POLICY, CaseStatus.CLOSED, EventType.CASE_CREATED)).toBeUndefined();
  });
});

describe("requiresAnchoring", () => {
  it("CASE_CREATED requires anchoring", () => {
    expect(requiresAnchoring(DEFAULT_POLICY, EventType.CASE_CREATED)).toBe(true);
  });

  it("CASE_INVESTIGATION_NOTE does not require anchoring", () => {
    expect(requiresAnchoring(DEFAULT_POLICY, EventType.CASE_INVESTIGATION_NOTE)).toBe(false);
  });
});

describe("isOverdue", () => {
  it("returns false for recent creation", () => {
    expect(isOverdue(DEFAULT_POLICY, new Date().toISOString())).toBe(false);
  });

  it("returns true for old creation", () => {
    const old = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    expect(isOverdue(DEFAULT_POLICY, old)).toBe(true);
  });
});

describe("validatePolicy", () => {
  it("validates DEFAULT_POLICY without errors", () => {
    expect(validatePolicy(DEFAULT_POLICY)).toEqual([]);
  });

  it("rejects non-object", () => {
    expect(validatePolicy("string")).not.toEqual([]);
  });

  it("rejects policy without version", () => {
    const bad = { ...DEFAULT_POLICY, version: undefined };
    expect(validatePolicy(bad).length).toBeGreaterThan(0);
  });
});
