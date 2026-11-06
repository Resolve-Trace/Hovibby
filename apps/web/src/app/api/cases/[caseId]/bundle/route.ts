/**
 * GET /api/cases/[caseId]/bundle — Export a verification bundle
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

    const bundle = await store.exportBundle(caseId);

    return NextResponse.json(bundle, {
      headers: {
        "Content-Disposition": `attachment; filename="resolvetrace-bundle-${caseId.slice(0, 8)}.json"`,
        "Content-Type": "application/json",
      },
    });
  } catch (e) {
    console.error("GET /api/cases/[caseId]/bundle error:", e);
    return NextResponse.json(
      { error: "Failed to export bundle", details: String(e) },
      { status: 500 }
    );
  }
}
