/**
 * Case detail page — server component.
 * ActionButtons are extracted to a client component (CaseActions.tsx).
 */

import { notFound } from "next/navigation";
import Link from "next/link";
import { getStore } from "@/lib/store";
import type { SignedEvent } from "@resolvetrace/protocol";
import { CaseActions } from "@/components/cases/CaseActions";
import { StatusBadge } from "@/components/ui/Badge";
import { CheckpointBadge } from "@/components/blockchain/CheckpointBadge";

interface Props {
  params: Promise<{ caseId: string }>;
}

export default async function CaseDetailPage({ params }: Props) {
  const { caseId } = await params;
  const store = getStore();

  const doc = await store.getCase(caseId);
  if (!doc) notFound();

  const events = await store.getEvents(caseId);
  const checkpoint = await store.getLatestCheckpoint(caseId);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Link
              href="/cases"
              className="text-slate-500 hover:text-slate-300 text-sm transition-colors"
            >
              ← Cases
            </Link>
            {doc.isDemo && <span className="badge badge-demo">DEMO DATA</span>}
          </div>
          <h1 className="text-2xl font-bold text-white">{doc.title}</h1>
          <div className="flex flex-wrap items-center gap-3 mt-2">
            <StatusBadge status={doc.status} />
            <span className="text-xs text-slate-500 font-mono">
              {caseId.slice(0, 8)}…
            </span>
            <span className="text-xs text-slate-500">
              {doc.category} · {doc.priority} priority
            </span>
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <a
            href={`/api/cases/${caseId}/bundle`}
            className="btn-secondary text-xs"
            download={`resolvetrace-bundle-${caseId.slice(0, 8)}.json`}
          >
            Export bundle
          </a>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Timeline + Actions */}
        <div className="lg:col-span-2 space-y-4">
          <div className="card bg-slate-900">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <h2 className="font-semibold text-white text-sm">Event Timeline</h2>
              <span className="text-xs text-slate-500">
                {events.length} event{events.length !== 1 ? "s" : ""}
              </span>
            </div>

            {events.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-sm">
                No events recorded
              </div>
            ) : (
              <div className="divide-y divide-slate-800">
                {events.map((event, idx) => (
                  <EventRow
                    key={event.eventId}
                    event={event}
                    isFirst={idx === 0}
                    isLast={idx === events.length - 1}
                    inCheckpoint={
                      checkpoint !== null &&
                      event.sequence >= checkpoint.eventSequenceStart &&
                      event.sequence <= checkpoint.eventSequenceEnd
                    }
                  />
                ))}
              </div>
            )}
          </div>

          {/* Client-side action buttons */}
          <CaseActions caseId={caseId} status={doc.status} />
        </div>

        {/* Right: Info + Verification */}
        <div className="space-y-4">
          {/* Case Info */}
          <div className="card bg-slate-900 p-4 space-y-3">
            <h3 className="font-semibold text-white text-sm border-b border-slate-800 pb-3">
              Case Information
            </h3>
            <InfoRow label="Case ID" value={caseId.slice(0, 12) + "…"} mono />
            <InfoRow
              label="Workflow ID"
              value={doc.workflowId.slice(0, 12) + "…"}
              mono
            />
            <InfoRow label="Organization" value={doc.organizationId} />
            <InfoRow label="Registry" value={doc.registryId} />
            <InfoRow
              label="Reporter"
              value={doc.isAnonymous ? "[anonymous]" : doc.reporterRef}
            />
            {doc.assignedOfficerRef && (
              <InfoRow label="Assigned to" value={doc.assignedOfficerRef} />
            )}
            <InfoRow label="Policy" value={doc.policyVersion} mono />
            <InfoRow
              label="Created"
              value={new Date(doc.createdAt).toLocaleString()}
            />
            {doc.deadlineAt && (
              <InfoRow
                label="Deadline"
                value={new Date(doc.deadlineAt).toLocaleDateString()}
              />
            )}
          </div>

          {/* Verification Status */}
          <div className="card bg-slate-900 p-4">
            <h3 className="font-semibold text-white text-sm border-b border-slate-800 pb-3 mb-3">
              Verification Status
            </h3>

            {checkpoint ? (
              <div className="space-y-3">
                <CheckpointBadge sequence={checkpoint.checkpointSequence} />
                <div className="text-xs text-slate-500 font-mono break-all">
                  {checkpoint.batchCommitment.slice(0, 24)}…
                </div>
                <p className="text-xs text-slate-600">
                  Submit through a wallet to anchor on-chain and make this
                  case independently verifiable via Stellar.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="badge badge-slate">No checkpoint</div>
                <p className="text-xs text-slate-500">
                  Events are locally recorded but not yet anchored on Stellar.
                </p>
              </div>
            )}

            <div className="mt-4 pt-4 border-t border-slate-800">
              {/* Server action via form POST */}
              <form action={`/api/cases/${caseId}/checkpoint`} method="POST">
                <button type="submit" className="btn-secondary w-full text-xs">
                  Build local checkpoint
                </button>
              </form>
            </div>
          </div>

          {/* Export */}
          <div className="card bg-slate-900 p-4">
            <h3 className="font-semibold text-white text-sm border-b border-slate-800 pb-3 mb-3">
              Independent Verification
            </h3>
            <p className="text-xs text-slate-500 mb-3">
              Export a bundle to verify without this server.
            </p>
            <a
              href={`/api/cases/${caseId}/bundle`}
              className="btn-secondary w-full text-xs text-center block"
              download
            >
              Export bundle.json
            </a>
            <p className="text-xs text-slate-600 mt-2 font-mono text-center">
              resolvetrace-verify verify bundle.json
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function EventRow({
  event,
  isFirst: _isFirst,
  isLast: _isLast,
  inCheckpoint,
}: {
  event: SignedEvent;
  isFirst: boolean;
  isLast: boolean;
  inCheckpoint: boolean;
}) {
  const typeLabel = event.eventType
    .replace(/\./g, " › ")
    .replace(/_/g, " ");

  return (
    <div className="p-4 text-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-slate-300 font-medium capitalize">
              {typeLabel}
            </span>
            {inCheckpoint && (
              <span
                className="text-emerald-400 text-xs"
                title="Included in checkpoint"
              >
                ⛓
              </span>
            )}
          </div>
          <div className="text-xs text-slate-500">
            Actor: {event.actorId} · Role: {event.actorRole}
          </div>
          <div className="text-xs text-slate-600 mt-1">
            Claimed: {new Date(event.claimedAt).toLocaleString()}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-xs text-slate-600 font-mono">
            seq #{event.sequence}
          </div>
          <div
            className="text-xs font-mono text-slate-700 mt-1 cursor-help"
            title={event.eventHash}
          >
            {event.eventHash.slice(0, 8)}…
          </div>
          <div className="flex gap-1 mt-1 justify-end">
            {event.signature ? (
              <span
                className="badge badge-green text-[10px]"
                title={`Sig: ${event.signature.slice(0, 16)}…`}
              >
                signed
              </span>
            ) : (
              <span className="badge badge-red text-[10px]">unsigned</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex justify-between gap-2 text-xs">
      <span className="text-slate-500 shrink-0">{label}</span>
      <span
        className={`text-slate-300 truncate text-right ${mono ? "font-mono" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}
