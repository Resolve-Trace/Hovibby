"use client";
/**
 * New Case creation form
 *
 * Submits to POST /api/cases.
 * Before submission, shows which metadata may appear on-chain.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiClient, type ApiError } from "@/lib/api-client";

const CATEGORIES = [
  { value: "complaint", label: "Complaint" },
  { value: "grievance", label: "Grievance" },
  { value: "misconduct", label: "Misconduct" },
  { value: "service_failure", label: "Service Failure" },
  { value: "billing_dispute", label: "Billing Dispute" },
  { value: "other", label: "Other" },
];

const PRIORITIES = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
];

const PRIVACY = [
  { value: "confidential", label: "Confidential (recommended)" },
  { value: "internal", label: "Internal" },
  { value: "public", label: "Public" },
];

export default function NewCasePage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    title: "",
    description: "",
    category: "complaint",
    priority: "medium",
    reporterRef: "",
    organizationId: "default-org",
    registryId: "default-registry",
    privacyClassification: "confidential",
    isAnonymous: false,
  });

  function handleChange(
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) {
    const { name, value, type } = e.target;
    setForm((f) => ({
      ...f,
      [name]:
        type === "checkbox" ? (e.target as HTMLInputElement).checked : value,
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const data = await apiClient.post<{ caseId: string }>("/api/cases", form);
      router.push(`/cases/${data.caseId}`);
    } catch (err) {
      const apiErr = err as ApiError;
      setError(apiErr.error ?? "Failed to create case");
      setSubmitting(false);
    }
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">New Case</h1>
        <p className="text-sm text-slate-400 mt-1">
          Create a verifiable complaint record
        </p>
      </div>

      {/* On-chain disclosure notice */}
      <div className="card bg-brand-950/30 border border-brand-800 p-4 mb-6 text-sm">
        <p className="text-brand-300 font-medium mb-1">
          📋 What gets recorded on-chain
        </p>
        <p className="text-slate-400 text-xs">
          When this case is anchored on Stellar, only a cryptographic
          commitment (hash) is stored on the blockchain — not the title,
          description, or personal details. The commitment proves the record
          existed at a point in time without revealing its contents.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="card bg-slate-900 p-6 space-y-4">
          {/* Title */}
          <div>
            <label className="label block mb-1.5" htmlFor="title">
              Case title <span className="text-red-400">*</span>
            </label>
            <input
              id="title"
              name="title"
              type="text"
              required
              maxLength={200}
              className="input w-full"
              placeholder="Brief description of the issue"
              value={form.title}
              onChange={handleChange}
            />
          </div>

          {/* Description */}
          <div>
            <label className="label block mb-1.5" htmlFor="description">
              Description
            </label>
            <textarea
              id="description"
              name="description"
              rows={4}
              className="input w-full resize-none"
              placeholder="Detailed description (stays off-chain in confidential storage)"
              value={form.description}
              onChange={handleChange}
            />
            <p className="text-xs text-slate-500 mt-1">
              The description is stored off-chain and is not committed to the blockchain.
            </p>
          </div>

          {/* Category + Priority */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label block mb-1.5" htmlFor="category">
                Category <span className="text-red-400">*</span>
              </label>
              <select
                id="category"
                name="category"
                className="input w-full"
                value={form.category}
                onChange={handleChange}
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label block mb-1.5" htmlFor="priority">
                Priority <span className="text-red-400">*</span>
              </label>
              <select
                id="priority"
                name="priority"
                className="input w-full"
                value={form.priority}
                onChange={handleChange}
              >
                {PRIORITIES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="card bg-slate-900 p-6 space-y-4">
          {/* Reporter */}
          <div>
            <label className="label block mb-1.5" htmlFor="reporterRef">
              Reporter reference <span className="text-red-400">*</span>
            </label>
            <input
              id="reporterRef"
              name="reporterRef"
              type="text"
              required
              className="input w-full"
              placeholder="Your name, email, or anonymous identifier"
              value={form.reporterRef}
              onChange={handleChange}
            />
          </div>

          {/* Anonymous */}
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              name="isAnonymous"
              checked={form.isAnonymous}
              onChange={handleChange}
              className="w-4 h-4 rounded"
            />
            <div>
              <span className="label">Anonymous reporting</span>
              <p className="text-xs text-slate-500">
                Note: anonymity is not guaranteed. Your IP and submission
                metadata may be visible to the system operator.
              </p>
            </div>
          </label>

          {/* Privacy */}
          <div>
            <label className="label block mb-1.5" htmlFor="privacyClassification">
              Privacy classification
            </label>
            <select
              id="privacyClassification"
              name="privacyClassification"
              className="input w-full"
              value={form.privacyClassification}
              onChange={handleChange}
            >
              {PRIVACY.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Advanced */}
        <details className="card bg-slate-900">
          <summary className="p-4 text-sm text-slate-400 cursor-pointer hover:text-white">
            Advanced settings
          </summary>
          <div className="p-4 pt-0 space-y-4 border-t border-slate-800 mt-4">
            <div>
              <label className="label block mb-1.5" htmlFor="organizationId">
                Organization ID
              </label>
              <input
                id="organizationId"
                name="organizationId"
                type="text"
                className="input w-full font-mono text-sm"
                value={form.organizationId}
                onChange={handleChange}
              />
            </div>
            <div>
              <label className="label block mb-1.5" htmlFor="registryId">
                Registry ID
              </label>
              <input
                id="registryId"
                name="registryId"
                type="text"
                className="input w-full font-mono text-sm"
                value={form.registryId}
                onChange={handleChange}
              />
              <p className="text-xs text-slate-500 mt-1">
                This registry ID is used when anchoring checkpoints to the
                Soroban contract. It must match a registry you have created.
              </p>
            </div>
          </div>
        </details>

        {error && (
          <div className="card bg-red-950/30 border-red-800 p-4 text-sm text-red-400">
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={submitting}
            className="btn-primary flex-1"
          >
            {submitting ? "Creating…" : "Create case"}
          </button>
          <a href="/cases" className="btn-secondary">
            Cancel
          </a>
        </div>
      </form>
    </div>
  );
}
