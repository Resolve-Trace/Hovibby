/**
 * ResolveTrace Protocol Types
 *
 * Canonical definitions for the protocol event format, policy schema,
 * checkpoint format, and verification result types.
 *
 * Version: 1
 *
 * TRUST BOUNDARIES:
 * - Cryptographic signatures prove control of a signing key, not real-world identity.
 * - Hash chains detect unauthorized changes to committed events; they do not prevent
 *   a malicious operator from withholding events or creating an alternative history.
 * - The truth of underlying claims is not established by this protocol.
 */

// ─── Protocol Version ────────────────────────────────────────────────────────

export const PROTOCOL_VERSION = 1 as const;
export type ProtocolVersion = typeof PROTOCOL_VERSION;

// ─── Domain Separators ───────────────────────────────────────────────────────
// Used to prevent hash collisions between different types of data.

export const DOMAIN = {
  EVENT_HASH: "resolvetrace:v1:event",
  PAYLOAD_COMMITMENT: "resolvetrace:v1:payload",
  CHECKPOINT_COMMITMENT: "resolvetrace:v1:checkpoint",
  MERKLE_LEAF: "resolvetrace:v1:merkle:leaf",
  MERKLE_NODE: "resolvetrace:v1:merkle:node",
  SIGNATURE: "resolvetrace:v1:sig",
} as const;

// ─── Event Types ─────────────────────────────────────────────────────────────

export enum EventType {
  // Case lifecycle
  CASE_CREATED = "case.created",
  CASE_ASSIGNED = "case.assigned",
  CASE_REASSIGNED = "case.reassigned",
  CASE_ACKNOWLEDGED = "case.acknowledged",
  CASE_INVESTIGATION_NOTE = "case.investigation_note",
  CASE_INFO_REQUESTED = "case.info_requested",
  CASE_INFO_PROVIDED = "case.info_provided",
  CASE_EVIDENCE_ADDED = "case.evidence_added",
  CASE_DEADLINE_EXTENDED = "case.deadline_extended",
  CASE_ESCALATED = "case.escalated",
  CASE_RESOLUTION_PROPOSED = "case.resolution_proposed",
  CASE_RESOLUTION_CONFIRMED = "case.resolution_confirmed",
  CASE_RESOLUTION_DISPUTED = "case.resolution_disputed",
  CASE_APPEAL_OPENED = "case.appeal_opened",
  CASE_APPEAL_ASSIGNED = "case.appeal_assigned",
  CASE_APPEAL_DECIDED = "case.appeal_decided",
  CASE_CLOSED = "case.closed",
  // Registry operations
  REGISTRY_CREATED = "registry.created",
  REGISTRY_WRITER_AUTHORIZED = "registry.writer_authorized",
  REGISTRY_DEACTIVATED = "registry.deactivated",
  // Checkpoint
  CHECKPOINT_SUBMITTED = "checkpoint.submitted",
  CHECKPOINT_CONFIRMED = "checkpoint.confirmed",
}

// ─── Actor Roles ─────────────────────────────────────────────────────────────

export enum ActorRole {
  REPORTER = "reporter",
  OFFICER = "officer",
  REVIEWER = "reviewer",
  ADMIN = "admin",
  SYSTEM = "system",
}

// ─── Case Categories and Priority ────────────────────────────────────────────

export enum CaseCategory {
  COMPLAINT = "complaint",
  GRIEVANCE = "grievance",
  MISCONDUCT = "misconduct",
  SERVICE_FAILURE = "service_failure",
  BILLING_DISPUTE = "billing_dispute",
  OTHER = "other",
}

export enum CasePriority {
  LOW = "low",
  MEDIUM = "medium",
  HIGH = "high",
  CRITICAL = "critical",
}

export enum CaseStatus {
  SUBMITTED = "submitted",
  ASSIGNED = "assigned",
  UNDER_INVESTIGATION = "under_investigation",
  AWAITING_INFO = "awaiting_info",
  RESOLUTION_PROPOSED = "resolution_proposed",
  AWAITING_CONFIRMATION = "awaiting_confirmation",
  RESOLVED = "resolved",
  DISPUTED = "disputed",
  UNDER_APPEAL = "under_appeal",
  CLOSED = "closed",
  ESCALATED = "escalated",
}

// ─── Canonical Event Format ───────────────────────────────────────────────────

/**
 * The canonical event payload — the typed content carried by an event.
 * Each event type has its own payload shape. Unknown payload fields are
 * allowed for forward compatibility but must not affect hash computation.
 */
export interface EventPayload {
  [key: string]: unknown;
}

/**
 * A serializable event before the signature is applied.
 * This is the data that is canonically serialized and hashed.
 */
export interface UnsignedEvent {
  /** Protocol version. Must be PROTOCOL_VERSION. */
  protocolVersion: number;

  /** Globally unique event ID (UUID v4). */
  eventId: string;

  /** Organization or tenant identifier. Not a secret. */
  organizationId: string;

  /** Workflow or case identifier this event belongs to. */
  workflowId: string;

  /** Event sequence number within the workflow. Starts at 1. */
  sequence: number;

  /** Event type. */
  eventType: EventType;

  /** Actor identifier (opaque string — may be a public key, username, or pseudonym). */
  actorId: string;

  /**
   * Actor public key (Ed25519, hex-encoded).
   * Used to verify the event signature.
   * May be omitted for anonymous events; verification will be UNAUTHORIZED_ACTOR.
   */
  actorPublicKey?: string;

  /** Actor role at the time of the event. */
  actorRole: ActorRole;

  /**
   * Timestamp claimed by the submitting system (ISO 8601 UTC).
   * This is NOT an authoritative timestamp. The Stellar ledger timestamp
   * for the checkpoint is a separate, independently verifiable time reference.
   */
  claimedAt: string;

  /**
   * SHA-256 commitment to the previous event in this workflow.
   * Hex-encoded. Empty string for the first event (sequence === 1).
   */
  previousEventHash: string;

  /**
   * SHA-256 commitment to the event payload.
   * Computed as HASH(DOMAIN.PAYLOAD_COMMITMENT || canonicalize(payload)).
   * Hex-encoded.
   */
  payloadCommitment: string;

  /** Policy version in effect at the time of this event. */
  policyVersion: string;

  /**
   * Optional checkpoint reference.
   * If this event is part of a batch that has been anchored on Stellar,
   * this field references the checkpoint.
   */
  checkpointRef?: string;
}

/**
 * A fully signed event. This is the canonical on-disk / in-bundle format.
 */
export interface SignedEvent extends UnsignedEvent {
  /**
   * Ed25519 signature over:
   *   DOMAIN.SIGNATURE || eventHash
   * where eventHash = HASH(DOMAIN.EVENT_HASH || canonicalize(unsignedEvent))
   * Hex-encoded.
   */
  signature: string;

  /**
   * SHA-256 hash of the canonical UnsignedEvent (without the signature field).
   * Hex-encoded. Cached here for convenience; verifiers must recompute it.
   */
  eventHash: string;
}

// ─── Policy Types ─────────────────────────────────────────────────────────────

export interface PolicyTransitionRule {
  from: CaseStatus[];
  to: CaseStatus;
  allowedRoles: ActorRole[];
  requiredEventType: EventType;
  requiresReason?: boolean;
}

export interface PolicyDeadlineRule {
  defaultDaysToResolve: number;
  extensionAllowedBy: ActorRole[];
  escalateAfterDays: number;
  maxExtensionDays: number;
}

export interface PolicyAppealRule {
  allowedWithinDays: number;
  assignedRole: ActorRole;
}

/**
 * A versioned policy definition.
 * Policies are deterministic; they must not change meaning for historical events.
 */
export interface Policy {
  version: string;
  organizationId: string;
  effectiveFrom: string;
  transitions: PolicyTransitionRule[];
  deadlineRules: PolicyDeadlineRule;
  appealRules: PolicyAppealRule;
  /** Event types that require an on-chain checkpoint. */
  anchoredEventTypes: EventType[];
}

// ─── Checkpoint Format ────────────────────────────────────────────────────────

/**
 * A checkpoint bundles a verifiable commitment to a batch of events.
 * It is submitted to the Soroban contract and recorded on Stellar.
 */
export interface Checkpoint {
  /** Protocol version. */
  protocolVersion: number;

  /** Organization or tenant identifier. */
  organizationId: string;

  /** Registry ID (used by the Soroban contract). */
  registryId: string;

  /** Monotonically increasing checkpoint sequence number. */
  checkpointSequence: number;

  /** First event sequence number in this batch. */
  eventSequenceStart: number;

  /** Last event sequence number in this batch. */
  eventSequenceEnd: number;

  /**
   * Commitment to the event batch.
   * For a single event: SHA-256(DOMAIN.CHECKPOINT_COMMITMENT || eventHash).
   * For a batch: Merkle root of all event hashes in sequence order.
   * Hex-encoded.
   */
  batchCommitment: string;

  /**
   * Commitment to the previous checkpoint.
   * Hex-encoded. Empty string for the first checkpoint.
   */
  previousCheckpointCommitment: string;

  /** Policy version in effect for this batch. */
  policyVersion: string;

  /** ISO 8601 UTC timestamp claimed by the submitter. */
  claimedAt: string;

  /** SHA-256 hash of this checkpoint object (excluding this field). Hex-encoded. */
  checkpointHash: string;
}

// ─── Verification Types ───────────────────────────────────────────────────────

export enum VerificationStatus {
  VALID = "VALID",
  INVALID_SIGNATURE = "INVALID_SIGNATURE",
  BROKEN_HASH_CHAIN = "BROKEN_HASH_CHAIN",
  CHECKPOINT_MISMATCH = "CHECKPOINT_MISMATCH",
  UNAUTHORIZED_ACTOR = "UNAUTHORIZED_ACTOR",
  INCOMPLETE_BUNDLE = "INCOMPLETE_BUNDLE",
  UNANCHORED_EVENTS = "UNANCHORED_EVENTS",
  NETWORK_UNAVAILABLE = "NETWORK_UNAVAILABLE",
  UNSUPPORTED_PROTOCOL_VERSION = "UNSUPPORTED_PROTOCOL_VERSION",
  INVALID_SCHEMA = "INVALID_SCHEMA",
}

export interface EventVerificationResult {
  eventId: string;
  sequence: number;
  hashValid: boolean;
  signatureValid: boolean | "skipped";
  chainLinkValid: boolean;
  details?: string;
}

export interface CheckpointVerificationResult {
  checkpointSequence: number;
  localCommitmentValid: boolean;
  onChainCommitment?: string;
  onChainMatch?: boolean;
  stellarTxHash?: string;
  ledgerTimestamp?: string;
  details?: string;
}

export interface VerificationResult {
  status: VerificationStatus;
  protocolVersion: number;
  organizationId: string;
  workflowId: string;
  totalEvents: number;
  verifiedEvents: EventVerificationResult[];
  checkpointResult?: CheckpointVerificationResult;
  warnings: string[];
  errors: string[];
  checkedAt: string;
  networkUsed: boolean;
  /** Summary of what could and could not be established. */
  summary: string;
}

// ─── Verification Bundle ──────────────────────────────────────────────────────

/**
 * A self-contained verification bundle exported from a case.
 * The independent verifier operates on this bundle without accessing
 * the original application backend.
 */
export interface VerificationBundle {
  bundleVersion: number;
  /** Protocol version — must match PROTOCOL_VERSION for the verifier to process it. */
  protocolVersion: number;
  exportedAt: string;
  organizationId: string;
  workflowId: string;
  events: SignedEvent[];
  checkpoint?: Checkpoint;
  /**
   * Authorization evidence: maps actorPublicKey -> list of roles.
   * This is included in the bundle so the verifier does not need to
   * contact the original authority.
   * NOTE: This evidence is included by the bundle creator and is
   * not independently authenticated beyond the contract state.
   */
  authorizationEvidence: Record<string, ActorRole[]>;
  policy: Policy;
}
