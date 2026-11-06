/**
 * POST /api/cases/[caseId]/evidence — Upload an evidence file
 * GET  /api/cases/[caseId]/evidence — List evidence refs for a case
 *
 * Evidence files are stored in the configured storage adapter.
 * A SHA-256 content hash is computed server-side before storage.
 * The hash is stored in the case manifest so integrity can be verified later.
 *
 * SECURITY:
 * - File names are sanitized (basename only, alphanumeric + ._-)
 * - File content is never executed
 * - Max upload size: 10 MB
 * - Allowed MIME types: common document and image formats
 * - Content hash is computed server-side; never trust the client's hash claim
 */

import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { randomUUID } from "crypto";
import { getStore } from "@/lib/store";
import type { EvidenceRef } from "@resolvetrace/storage";

const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

const ALLOWED_MIME_PREFIXES = [
  "image/",
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/json",
  "application/msword",
  "application/vnd.openxmlformats",
  "application/vnd.ms-",
  "video/",
  "audio/",
];

function isAllowedMime(mime: string): boolean {
  return ALLOWED_MIME_PREFIXES.some((prefix) => mime.startsWith(prefix));
}

function sanitizeFileName(name: string): string {
  // Take only the basename, replace anything not alphanumeric/dot/dash/underscore
  const base = name.split(/[/\\]/).pop() ?? "file";
  return base.replace(/[^a-zA-Z0-9._\-]/g, "_").slice(0, 200);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ caseId: string }> }
) {
  try {
    const { caseId } = await params;
    const store = getStore();

    const doc = await store.getCase(caseId);
    if (!doc) {
      return NextResponse.json({ error: "Case not found" }, { status: 404 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const uploadedBy = (formData.get("uploadedBy") as string | null) ?? "unknown";

    if (!file) {
      return NextResponse.json(
        { error: "No file provided. Send a multipart/form-data request with a 'file' field." },
        { status: 400 }
      );
    }

    // Size check
    if (file.size > MAX_SIZE_BYTES) {
      return NextResponse.json(
        { error: `File too large. Maximum allowed: ${MAX_SIZE_BYTES / 1024 / 1024} MB` },
        { status: 413 }
      );
    }

    // MIME type check
    const mimeType = file.type || "application/octet-stream";
    if (!isAllowedMime(mimeType)) {
      return NextResponse.json(
        {
          error: `File type not allowed: ${mimeType}`,
          allowedTypes: ALLOWED_MIME_PREFIXES,
        },
        { status: 415 }
      );
    }

    const fileName = sanitizeFileName(file.name);
    const evidenceId = randomUUID();

    // Read file bytes and compute SHA-256
    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

    const contentHash = createHash("sha256").update(bytes).digest("hex");

    // Store the file
    const storageKey = await store.storeEvidence(
      caseId,
      evidenceId,
      fileName,
      bytes
    );

    const evidenceRef: EvidenceRef = {
      evidenceId,
      fileName,
      mimeType,
      sizeBytes: file.size,
      contentHash,
      uploadedAt: new Date().toISOString(),
      uploadedBy,
      storageKey,
      accessible: true,
    };

    // Update the case manifest
    const updatedDoc = {
      ...doc,
      evidenceRefs: [...doc.evidenceRefs, evidenceRef],
      updatedAt: new Date().toISOString(),
    };
    await store.saveCase(updatedDoc);

    return NextResponse.json(
      {
        evidenceId,
        fileName,
        contentHash,
        sizeBytes: file.size,
        storageKey,
        note:
          "File stored. Content hash recorded in case manifest. " +
          "This hash proves file integrity; it does not prove the file's contents are true.",
      },
      { status: 201 }
    );
  } catch (e) {
    console.error("POST /api/cases/[caseId]/evidence error:", e);
    return NextResponse.json(
      { error: "Failed to store evidence", details: String(e) },
      { status: 500 }
    );
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ caseId: string }> }
) {
  try {
    const { caseId } = await params;
    const store = getStore();

    const doc = await store.getCase(caseId);
    if (!doc) {
      return NextResponse.json({ error: "Case not found" }, { status: 404 });
    }

    return NextResponse.json({
      evidenceRefs: doc.evidenceRefs,
      note: "Content hashes can be used to verify file integrity. The presence of a file does not prove the truth of its contents.",
    });
  } catch (e) {
    console.error("GET /api/cases/[caseId]/evidence error:", e);
    return NextResponse.json(
      { error: "Failed to list evidence", details: String(e) },
      { status: 500 }
    );
  }
}
