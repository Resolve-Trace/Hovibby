/**
 * GET  /api/cases — List cases
 * POST /api/cases — Create a new case
 *
 * Authentication: middleware.ts enforces SERVER_API_KEY on all /api/* routes.
 * Signing: events are signed with SERVER_SIGNING_KEY_HEX (see lib/signer.ts).
 */

import { NextRequest, NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { getSigningKey, signEvent } from "@/lib/signer";
import {
  CaseCategory,
  CasePriority,
  ActorRole,
  EventType,
  createUnsignedEvent,
  DEFAULT_POLICY,
} from "@resolvetrace/protocol";
import type { CaseDocument } from "@resolvetrace/storage";
import { randomUUID } from "crypto";

export async function GET(request: NextRequest) {
  try {
    const store = getStore();
    const url = new URL(request.url);
    const status = url.searchParams.get("status") ?? undefined;
    const organizationId = url.searchParams.get("organizationId") ?? undefined;
    const isDemo = url.searchParams.has("demo")
      ? url.searchParams.get("demo") === "true"
      : undefined;

    const cases = await store.listCases({ status, organizationId, isDemo });
    return NextResponse.json({ cases });
  } catch (e) {
    console.error("GET /api/cases error:", e);
    return NextResponse.json(
      { error: "Failed to list cases", details: String(e) },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;

    const title = body["title"] as string | undefined;
    const category = body["category"] as string | undefined;
    const priority = body["priority"] as string | undefined;
    const reporterRef = body["reporterRef"] as string | undefined;
    const organizationId = body["organizationId"] as string | undefined;
    const registryId = body["registryId"] as string | undefined;

    if (!title || !category || !priority || !reporterRef || !organizationId || !registryId) {
      return NextResponse.json(
        {
          error:
            "Missing required fields: title, category, priority, reporterRef, organizationId, registryId",
        },
        { status: 400 }
      );
    }

    if (!Object.values(CaseCategory).includes(category as CaseCategory)) {
      return NextResponse.json(
        {
          error: `Invalid category: ${category}. Valid values: ${Object.values(CaseCategory).join(", ")}`,
        },
        { status: 400 }
      );
    }
    if (!Object.values(CasePriority).includes(priority as CasePriority)) {
      return NextResponse.json(
        {
          error: `Invalid priority: ${priority}. Valid values: ${Object.values(CasePriority).join(", ")}`,
        },
        { status: 400 }
      );
    }

    const store = getStore();
    const policy = DEFAULT_POLICY;
    const caseId = randomUUID();
    const workflowId = randomUUID();

    // Use the configured persistent signing key — not an ephemeral throwaway.
    // The public key is embedded in the event and can be used to verify
    // this signature indefinitely.
    const signingKey = await getSigningKey();

    const payload = {
      title,
      category,
      priority,
      department: body["department"],
    };

    const unsigned = createUnsignedEvent({
      organizationId,
      workflowId,
      sequence: 1,
      eventType: EventType.CASE_CREATED,
      actorId: reporterRef,
      actorPublicKey: signingKey.publicKeyHex,
      actorRole: ActorRole.REPORTER,
      payload,
      policyVersion: policy.version,
      previousEventHash: "",
    });

    const signed = await signEvent(unsigned, signingKey.privateKeyHex);

    const now = new Date().toISOString();
    const doc: CaseDocument = {
      caseId,
      registryId,
      organizationId,
      workflowId,
      title,
      category,
      priority,
      status: "submitted",
      reporterRef,
      createdAt: now,
      updatedAt: now,
      isAnonymous: (body["isAnonymous"] as boolean | undefined) ?? false,
      privacyClassification:
        (body["privacyClassification"] as
          | "public"
          | "internal"
          | "confidential"
          | undefined) ?? "confidential",
      evidenceRefs: [],
      latestCheckpointSequence: 0,
      policyVersion: policy.version,
      isDemo: (body["isDemo"] as boolean | undefined) ?? false,
    };
    if (body["deadlineAt"]) {
      doc.deadlineAt = body["deadlineAt"] as string;
    }

    await store.saveCase(doc);
    await store.appendEvent(caseId, signed);

    return NextResponse.json(
      {
        caseId,
        workflowId,
        status: "submitted",
        eventId: signed.eventId,
        eventHash: signed.eventHash,
        signerPublicKey: signingKey.publicKeyHex,
        signerIsPersistent: signingKey.isPersistent,
      },
      { status: 201 }
    );
  } catch (e) {
    console.error("POST /api/cases error:", e);
    return NextResponse.json(
      { error: "Failed to create case", details: String(e) },
      { status: 500 }
    );
  }
}
