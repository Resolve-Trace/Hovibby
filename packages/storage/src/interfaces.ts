/**
 * ResolveTrace Storage Interfaces
 *
 * Two separate responsibilities:
 *
 * A. CaseStore — off-chain storage for case manifests, events, and evidence.
 *    Confidential case content must NOT be stored on-chain.
 *
 * B. AnchorClient — interaction with the Soroban contract for on-chain
 *    commitment anchoring and retrieval.
 *
 * DEPLOYMENT WARNING:
 *   A local filesystem adapter is NOT shared across server instances.
 *   Never claim that locally stored cases are globally available in a
 *   multi-instance deployment when they are not.
 *   For shared deployments, configure the S3-compatible adapter and
 *   set STORAGE_ADAPTER=s3 in your environment.
 */

import type {
  SignedEvent,
  Checkpoint,
  VerificationBundle,
} from "@resolvetrace/protocol";

// ─── Case Document ────────────────────────────────────────────────────────────

export interface EvidenceRef {
  evidenceId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  /** SHA-256 hash of the file content, hex-encoded. */
  contentHash: string;
  uploadedAt: string;
  uploadedBy: string;
  /** Storage-adapter-specific storage key or path. */
  storageKey: string;
  /**
   * Indicates whether the file is still accessible in the configured store.
   * Absence of the file does not change the validity of committed event hashes.
   */
  accessible: boolean;
}

export interface CaseDocument {
  caseId: string;
  registryId: string;
  organizationId: string;
  workflowId: string;
  title: string;
  category: string;
  priority: string;
  status: string;
  reporterRef: string;
  assignedOfficerRef?: string;
  createdAt: string;
  updatedAt: string;
  deadlineAt?: string;
  closedAt?: string;
  isAnonymous: boolean;
  privacyClassification: "public" | "internal" | "confidential";
  evidenceRefs: EvidenceRef[];
  latestCheckpointSequence: number;
  latestCheckpointHash?: string;
  policyVersion: string;
  /** Indicates this is demo data and must not be treated as a real record. */
  isDemo: boolean;
}

// ─── CaseStore Interface ──────────────────────────────────────────────────────

export interface ListCasesFilter {
  status?: string;
  assignedOfficerRef?: string;
  isDemo?: boolean;
  organizationId?: string;
}

export interface CaseStore {
  /**
   * Save or update a case document.
   * Uses atomic write semantics where supported.
   */
  saveCase(doc: CaseDocument): Promise<void>;

  /** Retrieve a case by its ID. Returns null if not found. */
  getCase(caseId: string): Promise<CaseDocument | null>;

  /** List cases matching the given filter. */
  listCases(filter?: ListCasesFilter): Promise<CaseDocument[]>;

  /** Delete a case and all its associated events and evidence. */
  deleteCase(caseId: string): Promise<void>;

  /** Append a signed event to a case's event log. */
  appendEvent(caseId: string, event: SignedEvent): Promise<void>;

  /** Retrieve all events for a case, sorted by sequence. */
  getEvents(caseId: string): Promise<SignedEvent[]>;

  /**
   * Store evidence file data.
   * Returns the storage key for retrieval.
   */
  storeEvidence(
    caseId: string,
    evidenceId: string,
    fileName: string,
    data: Uint8Array
  ): Promise<string>;

  /**
   * Retrieve evidence file data.
   * Returns null if not found or inaccessible.
   */
  getEvidence(storageKey: string): Promise<Uint8Array | null>;

  /** Save a checkpoint for a case. */
  saveCheckpoint(caseId: string, checkpoint: Checkpoint): Promise<void>;

  /** Get the latest checkpoint for a case. */
  getLatestCheckpoint(caseId: string): Promise<Checkpoint | null>;

  /** Export a VerificationBundle for a case. */
  exportBundle(caseId: string): Promise<VerificationBundle>;

  /**
   * Check that the configured store is accessible.
   * Returns an error description if not, undefined if healthy.
   */
  healthCheck(): Promise<string | undefined>;
}

// ─── Storage Configuration ────────────────────────────────────────────────────

export type StorageAdapterType = "filesystem" | "s3";

export interface FilesystemStorageConfig {
  type: "filesystem";
  basePath: string;
}

export interface S3StorageConfig {
  type: "s3";
  endpoint: string;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export type StorageConfig = FilesystemStorageConfig | S3StorageConfig;
