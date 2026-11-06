/**
 * POST /api/cases/[caseId]/checkpoint — Build and store a local checkpoint
 *
 * Building a checkpoint locally does NOT submit it to Stellar.
 * Use the wallet-signing flow in the frontend to anchor on-chain.
 */

import { NextRequest, NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { buildCheckpoint, validateHashChain } from "@resolvetrace/protocol";

export async function POST(
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

    const events = await store.getEvents(caseId);
    if (events.length === 0) {
      return NextResponse.json({ error: "No events to checkpoint" }, { status: 400 });
    }

    // Validate hash chain before building checkpoint
    const chainErrors = validateHashChain(events);
    if (chainErrors.length > 0) {
      return NextResponse.json(
        { error: "Hash chain invalid", details: chainErrors },
        { status: 422 }
      );
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

    return NextResponse.json({
      checkpointSequence: checkpoint.checkpointSequence,
      checkpointHash: checkpoint.checkpointHash,
      batchCommitment: checkpoint.batchCommitment,
      eventCount: events.length,
      status: "local",
      note: "Checkpoint saved locally. Submit to Stellar via wallet signing to anchor on-chain.",
    });
  } catch (e) {
    console.error("POST /api/cases/[caseId]/checkpoint error:", e);
    return NextResponse.json(
      { error: "Failed to build checkpoint", details: String(e) },
      { status: 500 }
    );
  }
}
