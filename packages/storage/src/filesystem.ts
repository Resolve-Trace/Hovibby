/**
 * ResolveTrace Local Filesystem Storage Adapter
 *
 * Stores cases, events, evidence, and checkpoints as JSON files
 * under a configurable base directory.
 *
 * Directory structure:
 *   {basePath}/
 *     cases/
 *       {caseId}/
 *         manifest.json          — CaseDocument
 *         events.jsonl           — One SignedEvent per line (append-only)
 *         checkpoints/
 *           {seq}.json           — Checkpoint
 *         evidence/
 *           {evidenceId}/{fileName}
 *
 * LIMITATIONS:
 *   1. NOT safe for concurrent writes from multiple processes.
 *      Use the S3 adapter for multi-instance deployments.
 *   2. Filesystem permissions are not a cryptographic immutability guarantee.
 *      Use the verifier to detect unauthorized changes to committed data.
 *   3. NOT suitable for a horizontally-scaled production deployment.
 *      Each server instance only sees the files on its own disk.
 *
 * Writes use a write-to-temp-then-rename pattern for atomicity on
 * POSIX-compatible filesystems. Windows atomic rename is best-effort.
 */

import {
  readFile,
  writeFile,
  mkdir,
  readdir,
  rename,
  access,
  appendFile,
} from "fs/promises";
import { join, resolve, basename } from "path";
import { constants } from "fs";
import type {
  CaseDocument,
  CaseStore,
  ListCasesFilter,
  FilesystemStorageConfig,
} from "./interfaces.js";
import type {
  SignedEvent,
  Checkpoint,
  VerificationBundle,
  ActorRole,
} from "@resolvetrace/protocol";
import { DEFAULT_POLICY, PROTOCOL_VERSION } from "@resolvetrace/protocol";

// ─── Safe filename validation ──────────────────────────────────────────────────

const SAFE_ID_RE = /^[a-zA-Z0-9_\-]{1,128}$/;

function assertSafeId(id: string, label: string): void {
  if (!SAFE_ID_RE.test(id)) {
    throw new Error(
      `Unsafe ${label}: "${id}". IDs must match [a-zA-Z0-9_-]{1,128}.`
    );
  }
}

// ─── Filesystem Adapter ────────────────────────────────────────────────────────

export class FilesystemCaseStore implements CaseStore {
  private readonly basePath: string;

  constructor(config: FilesystemStorageConfig) {
    this.basePath = resolve(config.basePath);
  }

  private casePath(caseId: string): string {
    assertSafeId(caseId, "caseId");
    return join(this.basePath, "cases", caseId);
  }

  private manifestPath(caseId: string): string {
    return join(this.casePath(caseId), "manifest.json");
  }

  private eventsPath(caseId: string): string {
    return join(this.casePath(caseId), "events.jsonl");
  }

  private checkpointPath(caseId: string, seq: number): string {
    return join(this.casePath(caseId), "checkpoints", `${seq}.json`);
  }

  private evidenceDirPath(caseId: string, evidenceId: string): string {
    assertSafeId(evidenceId, "evidenceId");
    return join(this.casePath(caseId), "evidence", evidenceId);
  }

  private async ensureDir(path: string): Promise<void> {
    await mkdir(path, { recursive: true });
  }

  /** Atomic write: write to temp file, then rename. */
  private async atomicWrite(filePath: string, data: string | Uint8Array): Promise<void> {
    const tmp = filePath + ".tmp." + Date.now().toString(36);
    await writeFile(tmp, data);
    await rename(tmp, filePath);
  }

  async saveCase(doc: CaseDocument): Promise<void> {
    assertSafeId(doc.caseId, "caseId");
    await this.ensureDir(this.casePath(doc.caseId));
    await this.ensureDir(join(this.casePath(doc.caseId), "checkpoints"));
    await this.atomicWrite(
      this.manifestPath(doc.caseId),
      JSON.stringify({ ...doc, _savedAt: new Date().toISOString() }, null, 2)
    );
  }

  async getCase(caseId: string): Promise<CaseDocument | null> {
    try {
      const data = await readFile(this.manifestPath(caseId), "utf-8");
      const parsed = JSON.parse(data) as CaseDocument;
      return parsed;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw e;
    }
  }

  async listCases(filter?: ListCasesFilter): Promise<CaseDocument[]> {
    const casesDir = join(this.basePath, "cases");
    try {
      await access(casesDir, constants.R_OK);
    } catch {
      return [];
    }

    const entries = await readdir(casesDir, { withFileTypes: true });
    const cases: CaseDocument[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const doc = await this.getCase(entry.name);
      if (!doc) continue;

      if (filter) {
        if (filter.status !== undefined && doc.status !== filter.status) continue;
        if (filter.assignedOfficerRef !== undefined && doc.assignedOfficerRef !== filter.assignedOfficerRef) continue;
        if (filter.isDemo !== undefined && doc.isDemo !== filter.isDemo) continue;
        if (filter.organizationId !== undefined && doc.organizationId !== filter.organizationId) continue;
      }

      cases.push(doc);
    }

    return cases.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async deleteCase(caseId: string): Promise<void> {
    // We intentionally do NOT delete committed case data automatically.
    // This must be an explicit, logged administrative action.
    // For the filesystem adapter, deletion is a manual operation.
    throw new Error(
      `Case deletion is not automated. ` +
        `To delete case ${caseId}, manually remove the directory: ` +
        this.casePath(caseId)
    );
  }

  async appendEvent(caseId: string, event: SignedEvent): Promise<void> {
    assertSafeId(caseId, "caseId");
    await this.ensureDir(this.casePath(caseId));
    const line = JSON.stringify(event) + "\n";
    await appendFile(this.eventsPath(caseId), line, "utf-8");
  }

  async getEvents(caseId: string): Promise<SignedEvent[]> {
    try {
      const data = await readFile(this.eventsPath(caseId), "utf-8");
      return data
        .split("\n")
        .filter((line) => line.trim().length > 0)
        .map((line) => JSON.parse(line) as SignedEvent)
        .sort((a, b) => a.sequence - b.sequence);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw e;
    }
  }

  async storeEvidence(
    caseId: string,
    evidenceId: string,
    fileName: string,
    data: Uint8Array
  ): Promise<string> {
    assertSafeId(caseId, "caseId");
    assertSafeId(evidenceId, "evidenceId");

    // Sanitize filename: keep only the basename, no directory traversal
    const safeName = basename(fileName).replace(/[^a-zA-Z0-9._\-]/g, "_");

    const dir = this.evidenceDirPath(caseId, evidenceId);
    await this.ensureDir(dir);

    const filePath = join(dir, safeName);
    await writeFile(filePath, data);

    // Return a relative storage key
    return `cases/${caseId}/evidence/${evidenceId}/${safeName}`;
  }

  async getEvidence(storageKey: string): Promise<Uint8Array | null> {
    // Storage key is relative; resolve against basePath
    if (storageKey.includes("..")) {
      throw new Error(`Unsafe storage key: ${storageKey}`);
    }
    const filePath = join(this.basePath, storageKey);
    try {
      const data = await readFile(filePath);
      return new Uint8Array(data);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw e;
    }
  }

  async saveCheckpoint(caseId: string, checkpoint: Checkpoint): Promise<void> {
    assertSafeId(caseId, "caseId");
    const dir = join(this.casePath(caseId), "checkpoints");
    await this.ensureDir(dir);
    await this.atomicWrite(
      this.checkpointPath(caseId, checkpoint.checkpointSequence),
      JSON.stringify(checkpoint, null, 2)
    );

    // Update the manifest with latest checkpoint info
    const doc = await this.getCase(caseId);
    if (doc) {
      doc.latestCheckpointSequence = checkpoint.checkpointSequence;
      doc.latestCheckpointHash = checkpoint.checkpointHash;
      doc.updatedAt = new Date().toISOString();
      await this.saveCase(doc);
    }
  }

  async getLatestCheckpoint(caseId: string): Promise<Checkpoint | null> {
    const doc = await this.getCase(caseId);
    if (!doc || doc.latestCheckpointSequence === 0) return null;

    try {
      const data = await readFile(
        this.checkpointPath(caseId, doc.latestCheckpointSequence),
        "utf-8"
      );
      return JSON.parse(data) as Checkpoint;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw e;
    }
  }

  async exportBundle(caseId: string): Promise<VerificationBundle> {
    const doc = await this.getCase(caseId);
    if (!doc) {
      throw new Error(`Case not found: ${caseId}`);
    }

    const events = await this.getEvents(caseId);
    const checkpoint = await this.getLatestCheckpoint(caseId);

    // Build authorization evidence from event actor public keys
    const authEvidence: Record<string, ActorRole[]> = {};
    for (const event of events) {
      if (event.actorPublicKey) {
        if (!authEvidence[event.actorPublicKey]) {
          authEvidence[event.actorPublicKey] = [];
        }
        if (!authEvidence[event.actorPublicKey]!.includes(event.actorRole as ActorRole)) {
          authEvidence[event.actorPublicKey]!.push(event.actorRole as ActorRole);
        }
      }
    }

    const bundle: VerificationBundle = {
      bundleVersion: 1,
      protocolVersion: PROTOCOL_VERSION,
      exportedAt: new Date().toISOString(),
      organizationId: doc.organizationId,
      workflowId: doc.workflowId,
      events,
      authorizationEvidence: authEvidence,
      policy: DEFAULT_POLICY,
    };
    if (checkpoint !== null) {
      bundle.checkpoint = checkpoint;
    }
    return bundle;
  }

  async healthCheck(): Promise<string | undefined> {
    try {
      await this.ensureDir(this.basePath);
      // Try writing and removing a test file
      const testPath = join(this.basePath, ".healthcheck");
      await writeFile(testPath, "ok");
      await import("fs/promises").then((fs) => fs.unlink(testPath));
      return undefined; // healthy
    } catch (e) {
      return `Filesystem storage unhealthy: ${e}`;
    }
  }
}
