/**
 * Cases list page
 */

import Link from "next/link";
import { getStore } from "@/lib/store";
import { StatusBadge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";

export default async function CasesPage() {
  let cases: Awaited<ReturnType<ReturnType<typeof getStore>["listCases"]>> = [];
  let storageError: string | null = null;

  try {
    const store = getStore();
    cases = await store.listCases({ isDemo: false });
  } catch (e) {
    storageError = String(e);
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Cases</h1>
          <p className="text-sm text-slate-400 mt-1">
            {cases.length} case{cases.length !== 1 ? "s" : ""} in the configured store
          </p>
        </div>
        <Link href="/cases/new" className="btn-primary">New Case</Link>
      </div>

      {storageError && (
        <div className="card bg-red-950/30 border-red-800 p-4 mb-6">
          <p className="text-sm text-red-400 font-medium">Storage error</p>
          <p className="text-xs text-red-500 mt-1 font-mono">{storageError}</p>
          <p className="text-xs text-slate-500 mt-2">
            Check your STORAGE_ADAPTER and STORAGE_FS_PATH environment variables.
          </p>
        </div>
      )}

      {cases.length === 0 && !storageError ? (
        <EmptyState
          icon="📋"
          title="No cases yet"
          description="Cases are stored in the configured storage adapter. Create a case to begin recording verifiable events."
          action={{ label: "Create first case", href: "/cases/new" }}
        />
      ) : (
        <div className="card bg-slate-900 divide-y divide-slate-800">
          {cases.map((c) => (
            <Link
              key={c.caseId}
              href={`/cases/${c.caseId}`}
              className="flex items-start gap-4 p-5 hover:bg-slate-800/40 transition-colors group"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium text-white group-hover:text-brand-300 transition-colors">
                    {c.title}
                  </span>
                  {c.isDemo && (
                    <span className="badge badge-demo">DEMO</span>
                  )}
                </div>
                <div className="text-xs text-slate-500 font-mono">
                  {c.caseId.slice(0, 8)}… · {c.organizationId}
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  Created {new Date(c.createdAt).toLocaleDateString()} ·{" "}
                  {c.category} · {c.priority} priority
                </div>
              </div>
              <div className="flex flex-col items-end gap-2 shrink-0">
                <StatusBadge status={c.status} />
                <div className="text-xs text-slate-600">
                  {c.latestCheckpointSequence > 0
                    ? `⛓ checkpoint #${c.latestCheckpointSequence}`
                    : "no checkpoint"}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}



