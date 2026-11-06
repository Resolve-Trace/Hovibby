/**
 * ResolveTrace Policy Engine
 *
 * Policies define valid state transitions, authorized roles, deadline rules,
 * escalation conditions, and appeal rules for a workflow.
 *
 * Policies are versioned and deterministic. A policy must not change meaning
 * for historical events. Changing a policy creates a new version.
 *
 * SECURITY: The policy engine validates user-level workflow rules.
 * Security-critical on-chain operations (checkpoint registration, writer
 * authorization) are enforced independently by the Soroban contract.
 * Frontend policy checks are NOT a security boundary for on-chain operations.
 */

import {
  type Policy,
  type UnsignedEvent,
  type PolicyTransitionRule,
  CaseStatus,
  ActorRole,
  EventType,
} from "./types.js";

// ─── Default Policy ───────────────────────────────────────────────────────────

/**
 * The default complaint-resolution policy for ResolveTrace v1.
 * Organizations can extend or replace this policy.
 */
export const DEFAULT_POLICY: Policy = {
  version: "1.0.0",
  organizationId: "*", // Wildcard — applies to all organizations unless overridden
  effectiveFrom: "2024-01-01T00:00:00Z",

  transitions: [
    // Reporter submits
    {
      from: [],
      to: CaseStatus.SUBMITTED,
      allowedRoles: [ActorRole.REPORTER, ActorRole.ADMIN],
      requiredEventType: EventType.CASE_CREATED,
    },
    // Admin or system assigns
    {
      from: [CaseStatus.SUBMITTED, CaseStatus.ESCALATED],
      to: CaseStatus.ASSIGNED,
      allowedRoles: [ActorRole.ADMIN, ActorRole.SYSTEM],
      requiredEventType: EventType.CASE_ASSIGNED,
    },
    // Officer acknowledges
    {
      from: [CaseStatus.ASSIGNED],
      to: CaseStatus.UNDER_INVESTIGATION,
      allowedRoles: [ActorRole.OFFICER],
      requiredEventType: EventType.CASE_ACKNOWLEDGED,
    },
    // Officer requests more info
    {
      from: [CaseStatus.UNDER_INVESTIGATION],
      to: CaseStatus.AWAITING_INFO,
      allowedRoles: [ActorRole.OFFICER],
      requiredEventType: EventType.CASE_INFO_REQUESTED,
      requiresReason: true,
    },
    // Reporter or admin provides info
    {
      from: [CaseStatus.AWAITING_INFO],
      to: CaseStatus.UNDER_INVESTIGATION,
      allowedRoles: [ActorRole.REPORTER, ActorRole.ADMIN],
      requiredEventType: EventType.CASE_INFO_PROVIDED,
    },
    // Officer proposes resolution
    {
      from: [CaseStatus.UNDER_INVESTIGATION, CaseStatus.AWAITING_INFO],
      to: CaseStatus.RESOLUTION_PROPOSED,
      allowedRoles: [ActorRole.OFFICER],
      requiredEventType: EventType.CASE_RESOLUTION_PROPOSED,
      requiresReason: true,
    },
    // Reporter confirms resolution
    {
      from: [CaseStatus.RESOLUTION_PROPOSED],
      to: CaseStatus.RESOLVED,
      allowedRoles: [ActorRole.REPORTER, ActorRole.ADMIN],
      requiredEventType: EventType.CASE_RESOLUTION_CONFIRMED,
    },
    // Reporter disputes resolution
    {
      from: [CaseStatus.RESOLUTION_PROPOSED],
      to: CaseStatus.DISPUTED,
      allowedRoles: [ActorRole.REPORTER],
      requiredEventType: EventType.CASE_RESOLUTION_DISPUTED,
      requiresReason: true,
    },
    // Reporter or admin opens appeal
    {
      from: [CaseStatus.DISPUTED, CaseStatus.RESOLVED],
      to: CaseStatus.UNDER_APPEAL,
      allowedRoles: [ActorRole.REPORTER, ActorRole.ADMIN],
      requiredEventType: EventType.CASE_APPEAL_OPENED,
      requiresReason: true,
    },
    // Reviewer assigned to appeal
    {
      from: [CaseStatus.UNDER_APPEAL],
      to: CaseStatus.UNDER_APPEAL,
      allowedRoles: [ActorRole.ADMIN],
      requiredEventType: EventType.CASE_APPEAL_ASSIGNED,
    },
    // Appeal decision recorded
    {
      from: [CaseStatus.UNDER_APPEAL],
      to: CaseStatus.CLOSED,
      allowedRoles: [ActorRole.REVIEWER, ActorRole.ADMIN],
      requiredEventType: EventType.CASE_APPEAL_DECIDED,
      requiresReason: true,
    },
    // Admin escalates overdue case
    {
      from: [CaseStatus.SUBMITTED, CaseStatus.ASSIGNED, CaseStatus.UNDER_INVESTIGATION, CaseStatus.AWAITING_INFO],
      to: CaseStatus.ESCALATED,
      allowedRoles: [ActorRole.ADMIN, ActorRole.SYSTEM],
      requiredEventType: EventType.CASE_ESCALATED,
      requiresReason: true,
    },
    // Admin or reviewer closes resolved case
    {
      from: [CaseStatus.RESOLVED],
      to: CaseStatus.CLOSED,
      allowedRoles: [ActorRole.ADMIN, ActorRole.SYSTEM],
      requiredEventType: EventType.CASE_CLOSED,
    },
  ],

  deadlineRules: {
    defaultDaysToResolve: 14,
    extensionAllowedBy: [ActorRole.ADMIN, ActorRole.OFFICER],
    escalateAfterDays: 14,
    maxExtensionDays: 30,
  },

  appealRules: {
    allowedWithinDays: 7,
    assignedRole: ActorRole.REVIEWER,
  },

  anchoredEventTypes: [
    EventType.CASE_CREATED,
    EventType.CASE_ASSIGNED,
    EventType.CASE_RESOLUTION_PROPOSED,
    EventType.CASE_RESOLUTION_CONFIRMED,
    EventType.CASE_RESOLUTION_DISPUTED,
    EventType.CASE_APPEAL_OPENED,
    EventType.CASE_APPEAL_DECIDED,
    EventType.CASE_CLOSED,
    EventType.CASE_ESCALATED,
  ],
};

// ─── Policy Validation ────────────────────────────────────────────────────────

export interface PolicyValidationResult {
  valid: boolean;
  errors: string[];
  matchedRule?: PolicyTransitionRule;
}

/**
 * Validate whether a proposed event represents a valid transition
 * from the current state, given the policy.
 *
 * @param policy - The policy to validate against.
 * @param currentStatus - The current case status (undefined for the initial creation event).
 * @param event - The proposed event.
 * @param reason - Optional reason string (required by some transitions).
 */
export function validatePolicyTransition(
  policy: Policy,
  currentStatus: CaseStatus | undefined,
  event: UnsignedEvent,
  reason?: string
): PolicyValidationResult {
  const errors: string[] = [];

  // Find matching transition rules
  const matchingRules = policy.transitions.filter((rule) => {
    const fromMatch =
      currentStatus === undefined
        ? rule.from.length === 0
        : rule.from.includes(currentStatus);
    const typeMatch = rule.requiredEventType === event.eventType;
    return fromMatch && typeMatch;
  });

  if (matchingRules.length === 0) {
    errors.push(
      `No policy rule allows transition from status="${currentStatus ?? "none"}" ` +
        `via event type="${event.eventType}"`
    );
    return { valid: false, errors };
  }

  // Use first matching rule
  const rule = matchingRules[0];
  if (!rule) {
    errors.push("Internal error: matched rule is undefined");
    return { valid: false, errors };
  }

  // Check actor role
  if (!rule.allowedRoles.includes(event.actorRole)) {
    errors.push(
      `Role "${event.actorRole}" is not authorized for this transition. ` +
        `Allowed roles: ${rule.allowedRoles.join(", ")}`
    );
  }

  // Check reason requirement
  if (rule.requiresReason && (!reason || reason.trim().length === 0)) {
    errors.push(`A reason is required for event type "${event.eventType}"`);
  }

  return {
    valid: errors.length === 0,
    errors,
    ...(errors.length === 0 ? { matchedRule: rule } : {}),
  };
}

/**
 * Determine the next case status for a given event type according to policy.
 * Returns undefined if no matching transition exists.
 */
export function getNextStatus(
  policy: Policy,
  currentStatus: CaseStatus | undefined,
  eventType: EventType
): CaseStatus | undefined {
  const rule = policy.transitions.find((r) => {
    const fromMatch =
      currentStatus === undefined
        ? r.from.length === 0
        : r.from.includes(currentStatus);
    return fromMatch && r.requiredEventType === eventType;
  });
  return rule?.to;
}

/**
 * Check whether a given event type requires on-chain anchoring according to policy.
 */
export function requiresAnchoring(
  policy: Policy,
  eventType: EventType
): boolean {
  return policy.anchoredEventTypes.includes(eventType);
}

/**
 * Check whether a case has exceeded its resolution deadline.
 */
export function isOverdue(
  policy: Policy,
  createdAt: string,
  currentDeadlineOverride?: Date
): boolean {
  const created = new Date(createdAt);
  const deadline =
    currentDeadlineOverride ??
    new Date(
      created.getTime() +
        policy.deadlineRules.defaultDaysToResolve * 24 * 60 * 60 * 1000
    );
  return new Date() > deadline;
}

/**
 * Validate that a policy object has the required fields.
 * Returns error strings; empty array = valid.
 */
export function validatePolicy(policy: unknown): string[] {
  const errors: string[] = [];
  if (!policy || typeof policy !== "object") {
    return ["Policy must be an object"];
  }
  const p = policy as Record<string, unknown>;
  if (typeof p["version"] !== "string") errors.push("Policy.version must be a string");
  if (typeof p["organizationId"] !== "string") errors.push("Policy.organizationId must be a string");
  if (!Array.isArray(p["transitions"])) errors.push("Policy.transitions must be an array");
  if (!p["deadlineRules"] || typeof p["deadlineRules"] !== "object") errors.push("Policy.deadlineRules must be an object");
  if (!p["appealRules"] || typeof p["appealRules"] !== "object") errors.push("Policy.appealRules must be an object");
  if (!Array.isArray(p["anchoredEventTypes"])) errors.push("Policy.anchoredEventTypes must be an array");
  return errors;
}
