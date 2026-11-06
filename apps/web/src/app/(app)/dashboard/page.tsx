/**
 * Dashboard — shows case overview, anchoring status, and recent activity.
 * Data is fetched from the local case store — not fabricated.
 */

import Link from "next/link";
import { getStore } from "@/lib/store";
import { StatusBadge } from "@/components/ui/Badge";

async function getDashboardData() {
  try {
    const store = getStore();
    const allCases = await store.listCases({ isDemo: false });

    const total = allCases.length;
    const submitted = allCases.filter((c) => c.status === "submitted").length;
    const underInvestigation = allCases.filter(
      (c) => c.status === "under_investigation"
    ).length;
    const escalated = allCases.filter((c) => c.status === "escalated").length;
    const underAppeal = allCases.filter(
      (c) => c.status === "under_appeal"
    ).length;
    const resolved = allCases.filter((c) => c.status === "resolved" || c.status === "closed").length;

    const anchored = allCases.filter(
      (c) => c.latestCheckpointSequence > 0
    ).length;

    const recent = allCases.slice(0, 10);

    return {
      total,
      submitted,
      underInvestigation,
      escalated,
      underAppeal,
      resolved,
      anchored,
      recent,
    };
  } catch {
    // Storage not configured — return empty state
    return {
      total: 0,
      submitted: 0,
      underInvestigation: 0,
      escalated: 0,
      underAppeal: 0,
      resolved: 0,
      anchored: 0,
      recent: [],
    };
  }
}

export default async function DashboardPage() {
  const data = await getDashboardData();

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-sm text-slate-400 mt-1">
            Case overview and anchoring status
          </p>
        </div>
        <Link href="/cases/new" className="btn-primary">
          New Case
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        {[
          { label: "Total", value: data.total, color: "blue" },
          { label: "Submitted", value: data.submitted, color: "yellow" },
          {
            label: "Investigating",
            value: data.underInvestigation,
            color: "blue",
          },
          { label: "Escalated", value: data.escalated, color: "red" },
          { label: "Under Appeal", value: data.underAppeal, color: "yellow" },
          { label: "Resolved", value: data.resolved, color: "green" },
        ].map((stat) => (
          <div key={stat.label} className="card p-4 bg-slate-900">
            <div className="text-2xl font-bold text-white">{stat.value}</div>
            <div className="text-xs text-slate-400 mt-1">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Anchoring status */}
      <div className="card bg-slate-900 p-6 mb-8">
        <h2 className="font-semibold text-white mb-4 flex items-center gap-2">
          <span className="text-brand-400">⛓</span>
          Stellar Anchoring
        </h2>
        <div className="flex items-center gap-4 text-sm">
          <div>
            <span className="text-slate-400">Anchored cases: </span>
            <span className="text-emerald-400 font-medium">{data.anchored}</span>
            <span className="text-slate-500"> / {data.total}</span>
          </div>
          {data.total > 0 && data.anchored < data.total && (
            <div className="badge badge-yellow">
              {data.total - data.anchored} case{data.total - data.anchored !== 1 ? "s" : ""} pending anchor
            </div>
          )}
        </div>
        {data.total === 0 && (
          <p className="text-sm text-slate-500 mt-2">
            No cases yet. Create a case to begin.
          </p>
        )}
        <p className="text-xs text-slate-600 mt-3">
          Anchored cases have a checkpoint commitment recorded on Stellar Testnet.
          Unanchored cases are locally persisted but not yet independently verifiable on-chain.
        </p>
      </div>

      {/* Recent cases */}
      <div className="card bg-slate-900">
        <div className="flex items-center justify-between p-6 border-b border-slate-800">
          <h2 className="font-semibold text-white">Recent Cases</h2>
          <Link
            href="/cases"
            className="text-sm text-brand-400 hover:text-brand-300 transition-colors"
          >
            View all →
          </Link>
        </div>

        {data.recent.length === 0 ? (
          <div className="p-12 text-center">
            <div className="text-4xl mb-4">📋</div>
            <p className="text-slate-400 font-medium">No cases yet</p>
            <p className="text-sm text-slate-500 mt-2">
              Create a case to start recording verifiable events.
            </p>
            <Link href="/cases/new" className="btn-primary mt-4 inline-flex">
              Create first case
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-slate-800">
            {data.recent.map((c) => (
              <Link
                key={c.caseId}
                href={`/cases/${c.caseId}`}
                className="flex items-center gap-4 p-4 hover:bg-slate-800/50 transition-colors group"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-white group-hover:text-brand-300 transition-colors truncate">
                    {c.title}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {c.caseId.slice(0, 8)}… · {new Date(c.createdAt).toLocaleDateString()}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <StatusBadge status={c.status} />
                  {c.latestCheckpointSequence > 0 && (
                    <span className="text-emerald-400 text-xs" title="Checkpoint anchored">
                      ⛓
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}



