/**
 * GET  /api/cases/[caseId]/events — Get all events for a case
 * POST /api/cases/[caseId]/events — Advance workflow with a new event
 *
 * Authentication: middleware.ts enforces SERVER_API_KEY on all /api/* routes.
 * Signing: events are signed with SERVER_SIGNING_KEY_HEX (see lib/signer.ts).
 */

import { NextRequest, NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { getSigningKey, signEvent } from "@/lib/signer";
import {
  DEFAULT_POLICY,
  EventType,
  ActorRole,
  createUnsignedEvent,
  validatePolicyTransition,
  getNextStatus,
  type CaseStatus,
} from "@resolvetrace/protocol";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ caseId: string }> }
) {
  try {
    const { caseId } = await params;
    const store = getStore();
    const events = await store.getEvents(caseId);
    return NextResponse.json({ events });
  } catch (e) {
    console.error("GET /api/cases/[caseId]/events error:", e);
    return NextResponse.json(
      { error: "Failed to get events", details: String(e) },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ caseId: string }> }
) {
  try {
    const { caseId } = await params;
    const body = (await request.json()) as Record<string, unknown>;
    const store = getStore();

    const doc = await store.getCase(caseId);
    if (!doc) {
      return NextResponse.json({ error: "Case not found" }, { status: 404 });
    }

    const eventType = body["eventType"] as string | undefined;
    const actorId = body["actorId"] as string | undefined;
    const actorRole = body["actorRole"] as string | undefined;
    const payload = body["payload"] as Record<string, unknown> | undefined;
    const reason = body["reason"] as string | undefined;

    if (!eventType || !actorId || !actorRole || !payload) {
      return NextResponse.json(
        {
          error:
            "Missing required fields: eventType, actorId, actorRole, payload",
        },
        { status: 400 }
      );
    }

    if (!Object.values(EventType).includes(eventType as EventType)) {
      return NextResponse.json(
        { error: `Invalid eventType: ${eventType}` },
        { status: 400 }
      );
    }

    if (!Object.values(ActorRole).includes(actorRole as ActorRole)) {
      return NextResponse.json(
        { error: `Invalid actorRole: ${actorRole}` },
        { status: 400 }
      );
    }

    const policy = DEFAULT_POLICY;
    const prevEvents = await store.getEvents(caseId);
    const lastEvent = prevEvents[prevEvents.length - 1];
    if (!lastEvent) {
      return NextResponse.json(
        { error: "No existing events found for case" },
        { status: 400 }
      );
    }

    // Use the configured persistent signing key.
    const signingKey = await getSigningKey();

    const provisional = createUnsignedEvent({
      organizationId: doc.organizationId,
      workflowId: doc.workflowId,
      sequence: prevEvents.length + 1,
      eventType: eventType as EventType,
      actorId,
      actorPublicKey: signingKey.publicKeyHex,
      actorRole: actorRole as ActorRole,
      payload,
      policyVersion: policy.version,
      previousEventHash: lastEvent.eventHash,
    });

    const validation = validatePolicyTransition(
      policy,
      doc.status as CaseStatus,
      provisional,
      reason
    );

    if (!validation.valid) {
      return NextResponse.json(
        { error: "Policy violation", details: validation.errors },
        { status: 422 }
      );
    }

    const signed = await signEvent(provisional, signingKey.privateKeyHex);
    const newStatus = getNextStatus(
      policy,
      doc.status as CaseStatus,
      eventType as EventType
    );

    await store.appendEvent(caseId, signed);

    const updatedDoc = {
      ...doc,
      status: newStatus ?? doc.status,
      updatedAt: signed.claimedAt,
    };
    if (eventType === EventType.CASE_ASSIGNED) {
      const officerId = payload["officerId"];
      if (typeof officerId === "string") {
        updatedDoc.assignedOfficerRef = officerId;
      }
    }
    await store.saveCase(updatedDoc);

    return NextResponse.json({
      eventId: signed.eventId,
      eventHash: signed.eventHash,
      sequence: signed.sequence,
      newStatus: newStatus ?? doc.status,
      signerPublicKey: signingKey.publicKeyHex,
      signerIsPersistent: signingKey.isPersistent,
    });
  } catch (e) {
    console.error("POST /api/cases/[caseId]/events error:", e);
    return NextResponse.json(
      { error: "Failed to create event", details: String(e) },
      { status: 500 }
    );
  }
}
