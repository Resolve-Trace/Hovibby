"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiClient, type ApiError } from "@/lib/api-client";

interface CaseAction {
  label: string;
  eventType: string;
  role: string;
  requiresReason?: boolean;
}

interface Props {
  caseId: string;
  status: string;
}

const ACTIONS_BY_STATUS: Record<string, CaseAction[]> = {
  submitted: [
    { label: "Assign case", eventType: "case.assigned", role: "admin" },
    { label: "Escalate", eventType: "case.escalated", role: "admin", requiresReason: true },
  ],
  assigned: [
    { label: "Acknowledge", eventType: "case.acknowledged", role: "officer" },
    { label: "Escalate", eventType: "case.escalated", role: "admin", requiresReason: true },
  ],
  under_investigation: [
    { label: "Propose resolution", eventType: "case.resolution_proposed", role: "officer", requiresReason: true },
    { label: "Request more info", eventType: "case.info_requested", role: "officer", requiresReason: true },
  ],
  awaiting_info: [
    { label: "Provide info", eventType: "case.info_provided", role: "reporter" },
  ],
  resolution_proposed: [
    { label: "Confirm resolution", eventType: "case.resolution_confirmed", role: "reporter" },
    { label: "Dispute resolution", eventType: "case.resolution_disputed", role: "reporter", requiresReason: true },
  ],
  disputed: [
    { label: "Open appeal", eventType: "case.appeal_opened", role: "reporter", requiresReason: true },
  ],
  resolved: [
    { label: "Open appeal", eventType: "case.appeal_opened", role: "reporter", requiresReason: true },
    { label: "Close case", eventType: "case.closed", role: "admin" },
  ],
};

export function CaseActions({ caseId, status }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reasonModal, setReasonModal] = useState<CaseAction | null>(null);
  const [reason, setReason] = useState("");

  const available = ACTIONS_BY_STATUS[status] ?? [];
  if (available.length === 0) return null;

  async function submitAction(action: CaseAction, actionReason?: string) {
    setLoading(action.eventType);
    setError(null);

    try {
      await apiClient.post(`/api/cases/${caseId}/events`, {
        eventType: action.eventType,
        actorId: `demo-${action.role}`,
        actorRole: action.role,
        payload: {
          action: action.label,
          ...(actionReason ? { reason: actionReason } : {}),
        },
        reason: actionReason,
      });

      router.refresh();
    } catch (err) {
      const apiErr = err as ApiError;
      setError(apiErr.error ?? "Action failed");
    }
    setLoading(null);
  }

  function handleAction(action: CaseAction) {
    if (action.requiresReason) {
      setReasonModal(action);
      setReason("");
    } else {
      void submitAction(action);
    }
  }

  return (
    <div className="card bg-slate-900 p-4">
      <h3 className="font-semibold text-white text-sm mb-3">Actions</h3>

      <div className="flex flex-wrap gap-2">
        {available.map((action) => (
          <button
            key={action.eventType}
            onClick={() => handleAction(action)}
            disabled={loading !== null}
            className="btn-secondary text-xs"
          >
            {loading === action.eventType ? "…" : action.label}
          </button>
        ))}
      </div>

      {error && (
        <p className="text-xs text-red-400 mt-2">{error}</p>
      )}

      {/* Reason modal */}
      {reasonModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="card bg-slate-900 p-6 max-w-md w-full">
            <h3 className="font-semibold text-white mb-3">{reasonModal.label}</h3>
            <label className="label block mb-1.5 text-xs">
              Reason <span className="text-red-400">*</span>
            </label>
            <textarea
              className="input w-full resize-none text-sm"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explain the reason for this action"
              autoFocus
            />
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => {
                  if (!reason.trim()) return;
                  void submitAction(reasonModal, reason);
                  setReasonModal(null);
                }}
                disabled={!reason.trim()}
                className="btn-primary text-xs flex-1"
              >
                Confirm
              </button>
              <button
                onClick={() => setReasonModal(null)}
                className="btn-secondary text-xs"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
