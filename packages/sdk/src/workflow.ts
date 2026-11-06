/**
 * ResolveTrace Workflow SDK
 *
 * High-level operations for creating and managing complaint-resolution workflows.
 * This module ties together the protocol, storage, and Stellar layers.
 *
 * SDK consumers use these functions to:
 *   1. Create a new case
 *   2. Advance the workflow with new events
 *   3. Build and anchor a checkpoint
 *   4. Export a verification bundle
 *   5. Verify a bundle independently
 */

import { v4 as uuidv4 } from "uuid";
import * as StellarSdk from "stellar-sdk";
import type {
  Policy,
  SignedEvent,
  VerificationBundle,
  VerificationResult,
} from "@resolvetrace/protocol";
import {
  CaseCategory,
  CasePriority,
  CaseStatus,
  EventType,
  ActorRole,
  DEFAULT_POLICY,
  createUnsignedEvent,
  signEvent,
  validateHashChain,
  buildCheckpoint,
  verifyBundle,
  getNextStatus,
  validatePolicyTransition,
} from "@resolvetrace/protocol";
import type { CaseStore, CaseDocument } from "@resolvetrace/storage";
import type { StellarClient } from "./stellar-client.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CreateCaseInput {
  organizationId: string;
  registryId: string;
  title: string;
  category: CaseCategory;
  priority: CasePriority;
  description: string;
  reporterRef: string;
  reporterPublicKey?: string;
  department?: string;
  isAnonymous?: boolean;
  privacyClassification?: "public" | "internal" | "confidential";
  deadlineAt?: string;
  policy?: Policy;
  /** Private key for signing (hex). NEVER pass browser wallet keys here.) */
  signingKeyHex: string;
}

export interface AdvanceWorkflowInput {
  caseId: string;
  actorId: string;
  actorRole: ActorRole;
  actorPublicKey?: string;
  eventType: EventType;
  payload: Record<string, unknown>;
  reason?: string;
  signingKeyHex: string;
  policy?: Policy;
}

export interface AnchorCheckpointInput {
  caseId: string;
  writerPublicKey: string;
  /** Called to sign the prepared transaction. Must return a signed XDR string. */
  signTransaction: (txXdr: string) => Promise<string>;
  stellarClient: StellarClient;
}

// ─── Workflow SDK ─────────────────────────────────────────────────────────────

/**
 * Create a new complaint case and its initial CASE_CREATED event.
 */
export async function createCase(
  store: CaseStore,
  input: CreateCaseInput
): Promise<{ caseId: string; workflowId: string; event: SignedEvent }> {
  const caseId = uuidv4();
  const workflowId = uuidv4();
  const policy = input.policy ?? DEFAULT_POLICY;

  const payload = {
    title: input.title,
    category: input.category,
    priority: input.priority,
    department: input.department,
    // Do not include the description in the payload commitment for confidential cases.
    // The description is stored only in the case manifest (off-chain).
    descriptionHash: undefined as string | undefined,
  };

  const createEventOpts: Parameters<typeof createUnsignedEvent>[0] = {
    organizationId: input.organizationId,
    workflowId,
    sequence: 1,
    eventType: EventType.CASE_CREATED,
    actorId: input.reporterRef,
    actorRole: ActorRole.REPORTER,
    payload,
    policyVersion: policy.version,
    previousEventHash: "",
  };
  if (input.reporterPublicKey) {
    createEventOpts.actorPublicKey = input.reporterPublicKey;
  }

  const unsigned = createUnsignedEvent(createEventOpts);

  const signed = await signEvent(unsigned, input.signingKeyHex);

  const doc: CaseDocument = {
    caseId,
    registryId: input.registryId,
    organizationId: input.organizationId,
    workflowId,
    title: input.title,
    category: input.category,
    priority: input.priority,
    status: CaseStatus.SUBMITTED,
    reporterRef: input.reporterRef,
    createdAt: unsigned.claimedAt,
    updatedAt: unsigned.claimedAt,
    isAnonymous: input.isAnonymous ?? false,
    privacyClassification: input.privacyClassification ?? "confidential",
    evidenceRefs: [],
    latestCheckpointSequence: 0,
    policyVersion: policy.version,
    isDemo: false,
  };
  if (input.deadlineAt) {
    doc.deadlineAt = input.deadlineAt;
  }

  await store.saveCase(doc);
  await store.appendEvent(caseId, signed);

  return { caseId, workflowId, event: signed };
}

/**
 * Advance a workflow by recording a new event.
 *
 * Validates the policy transition before accepting the event.
 * Throws if the transition is not permitted.
 */
export async function advanceWorkflow(
  store: CaseStore,
  input: AdvanceWorkflowInput
): Promise<SignedEvent> {
  const doc = await store.getCase(input.caseId);
  if (!doc) throw new Error(`Case not found: ${input.caseId}`);

  const policy = input.policy ?? DEFAULT_POLICY;

  // Build a provisional unsigned event for policy validation
  const prevEvents = await store.getEvents(input.caseId);
  const lastEvent = prevEvents[prevEvents.length - 1];
  if (!lastEvent) throw new Error("No events found for case");

  const provisionalOpts: Parameters<typeof createUnsignedEvent>[0] = {
    organizationId: doc.organizationId,
    workflowId: doc.workflowId,
    sequence: prevEvents.length + 1,
    eventType: input.eventType,
    actorId: input.actorId,
    actorRole: input.actorRole,
    payload: input.payload,
    policyVersion: policy.version,
    previousEventHash: lastEvent.eventHash,
  };
  if (input.actorPublicKey) {
    provisionalOpts.actorPublicKey = input.actorPublicKey;
  }

  const provisional = createUnsignedEvent(provisionalOpts);

  const currentStatus = doc.status as CaseStatus;
  const validation = validatePolicyTransition(
    policy,
    currentStatus,
    provisional,
    input.reason
  );

  if (!validation.valid) {
    throw new Error(
      `Policy violation: ${validation.errors.join("; ")}`
    );
  }

  const signed = await signEvent(provisional, input.signingKeyHex);

  // Determine new status
  const newStatus = getNextStatus(policy, currentStatus, input.eventType);

  // Update case document
  await store.appendEvent(input.caseId, signed);

  const updatedDoc: CaseDocument = {
    ...doc,
    status: newStatus ?? doc.status,
    updatedAt: signed.claimedAt,
  };
  if (input.eventType === EventType.CASE_ASSIGNED) {
    const officerId = input.payload["officerId"];
    if (typeof officerId === "string") {
      updatedDoc.assignedOfficerRef = officerId;
    }
  }
  await store.saveCase(updatedDoc);

  return signed;
}

/**
 * Build a checkpoint from all events in a case and store it locally.
 * Does NOT submit to Stellar — use anchorCheckpoint for that.
 */
export async function buildCaseCheckpoint(
  store: CaseStore,
  caseId: string
): Promise<import("@resolvetrace/protocol").Checkpoint> {
  const doc = await store.getCase(caseId);
  if (!doc) throw new Error(`Case not found: ${caseId}`);

  const events = await store.getEvents(caseId);
  if (events.length === 0) throw new Error("No events to checkpoint");

  // Validate the chain first
  const chainErrors = validateHashChain(events);
  if (chainErrors.length > 0) {
    throw new Error(`Hash chain invalid before checkpointing: ${chainErrors.join("; ")}`);
  }

  const prevCheckpoint = await store.getLatestCheckpoint(caseId);
  const checkpointSeq = (prevCheckpoint?.checkpointSequence ?? 0) + 1;
  const prevCommitment = prevCheckpoint?.checkpointHash ?? "";

  const checkpoint = buildCheckpoint({
    organizationId: doc.organizationId,
    registryId: doc.registryId,
    checkpointSequence: checkpointSeq,
    events,
    previousCheckpointCommitment: prevCommitment,
    policyVersion: doc.policyVersion,
  });

  await store.saveCheckpoint(caseId, checkpoint);
  return checkpoint;
}

/**
 * Anchor a checkpoint on Stellar via wallet signing.
 *
 * This function:
 *   1. Builds the checkpoint if not already done.
 *   2. Prepares the transaction for wallet signing.
 *   3. Calls the provided signTransaction callback.
 *   4. Submits the signed transaction.
 *   5. Waits for confirmation.
 *   6. Returns the transaction result.
 *
 * The signTransaction callback must be a real wallet implementation.
 * Never pass a function that signs with a hardcoded private key.
 */
export async function anchorCheckpoint(
  store: CaseStore,
  input: AnchorCheckpointInput
): Promise<import("./stellar-client.js").TransactionResult> {
  const checkpoint = await store.getLatestCheckpoint(input.caseId);
  if (!checkpoint) {
    throw new Error(
      "No checkpoint to anchor. Call buildCaseCheckpoint first."
    );
  }

  const { stellarClient, writerPublicKey, signTransaction } = input;

  // Build the transaction
  const tx = await stellarClient.buildRegisterCheckpointTx(
    writerPublicKey,
    checkpoint.registryId,
    checkpoint
  );

  // Sign via wallet
  const signedXdr = await signTransaction(tx.toXDR());

  // Deserialize signed tx
  const signedTx = StellarSdk.TransactionBuilder.fromXDR(
    signedXdr,
    tx.networkPassphrase ?? "Test SDF Network ; September 2015"
  );

  // Submit
  const txHash = await stellarClient.submitTransaction(
    signedTx as import("stellar-sdk").Transaction
  );

  // Wait for confirmation
  const result = await stellarClient.waitForConfirmation(txHash);
  return result;
}

/**
 * Export a verification bundle for a case.
 * The bundle can be independently verified without the original backend.
 */
export async function exportVerificationBundle(
  store: CaseStore,
  caseId: string
): Promise<VerificationBundle> {
  return store.exportBundle(caseId);
}

/**
 * Independently verify a bundle.
 * When a StellarClient and contractId are provided, also validates on-chain.
 */
export async function verifyCase(
  bundle: VerificationBundle,
  stellarClient?: StellarClient,
  contractId?: string
): Promise<VerificationResult> {
  return verifyBundle({
    bundle,
    ...(contractId !== undefined ? { contractId } : {}),
    ...(stellarClient !== undefined ? { onChainClient: stellarClient } : {}),
  });
}
