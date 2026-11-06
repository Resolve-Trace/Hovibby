/**
 * @resolvetrace/sdk — public API
 *
 * Re-exports everything from @resolvetrace/protocol and @resolvetrace/storage
 * plus the Stellar client and high-level workflow operations.
 */

// Protocol primitives (re-exported for SDK consumers)
export * from "@resolvetrace/protocol";

// Storage interfaces (re-exported for convenience)
export type { CaseStore, CaseDocument, EvidenceRef, StorageConfig } from "@resolvetrace/storage";
export { FilesystemCaseStore, createCaseStore, createCaseStoreFromEnv } from "@resolvetrace/storage";

// Stellar client
export { StellarClient, createStellarClientFromEnv } from "./stellar-client.js";
export type { TransactionStatus, TransactionResult, StellarNetworkConfig } from "./stellar-client.js";

// Workflow SDK
export {
  createCase,
  advanceWorkflow,
  buildCaseCheckpoint,
  anchorCheckpoint,
  exportVerificationBundle,
  verifyCase,
} from "./workflow.js";
export type {
  CreateCaseInput,
  AdvanceWorkflowInput,
  AnchorCheckpointInput,
} from "./workflow.js";
