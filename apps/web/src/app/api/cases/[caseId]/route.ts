/**
 * GET /api/cases/[caseId] — Get a case
 */

import { NextRequest, NextResponse } from "next/server";
import { getStore } from "@/lib/store";

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

    return NextResponse.json({ case: doc });
  } catch (e) {
    console.error("GET /api/cases/[caseId] error:", e);
    return NextResponse.json(
      { error: "Failed to get case", details: String(e) },
      { status: 500 }
    );
  }
}
