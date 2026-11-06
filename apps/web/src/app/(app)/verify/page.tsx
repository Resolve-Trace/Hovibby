"use client";
/**
 * Bundle Verification page.
 *
 * Runs offline cryptographic verification entirely in the browser.
 * No data is sent to this server — the bundle is parsed and verified locally.
 *
 * VALID means the bundle is internally consistent.
 * It does NOT mean claims are true or that all events were disclosed.
 */

import { useState } from "react";
import type { VerificationBundle } from "@resolvetrace/protocol";
import { verifyBundle } from "@resolvetrace/protocol";
import { VerificationResultCard } from "@/components/verification/VerificationResultCard";
import type { VerificationResult } from "@resolvetrace/protocol";

export default function VerifyPage() {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setResult(null);
    setParseError(null);
  }

  async function handleVerify() {
    if (!file) return;
    setLoading(true);
    setResult(null);
    setParseError(null);

    try {
      const text = await file.text();
      let bundle: VerificationBundle;
      try {
        bundle = JSON.parse(text) as VerificationBundle;
      } catch {
        setParseError("The file is not valid JSON.");
        setLoading(false);
        return;
      }

      const contractId = process.env["NEXT_PUBLIC_CONTRACT_ID"] || undefined;
      const verified = await verifyBundle({
        bundle,
        ...(contractId ? { contractId } : {}),
      });

      setResult(verified);
    } catch (e) {
      setParseError(`Verification error: ${String(e)}`);
    }

    setLoading(false);
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Verify Bundle</h1>
        <p className="text-sm text-slate-400 mt-1">
          Verify a ResolveTrace bundle independently — no server access needed
        </p>
      </div>

      {/* Upload card */}
      <div className="card bg-slate-900 p-6 mb-6">
        <label className="block mb-4">
          <span className="label block mb-2">Select bundle (.json)</span>
          <input
            type="file"
            accept=".json,application/json"
            onChange={handleFileChange}
            aria-label="Select verification bundle file"
            className="block w-full text-sm text-slate-400
              file:mr-4 file:py-2 file:px-4 file:rounded-lg
              file:border-0 file:text-sm file:font-medium
              file:bg-brand-600 file:text-white
              hover:file:bg-brand-700 cursor-pointer"
          />
        </label>

        {file && (
          <p className="text-xs text-slate-500 mb-4">
            {file.name} — {(file.size / 1024).toFixed(1)} KB
          </p>
        )}

        <button
          onClick={handleVerify}
          disabled={!file || loading}
          className="btn-primary"
          aria-label="Verify the selected bundle"
        >
          {loading ? "Verifying…" : "Verify bundle"}
        </button>
      </div>

      {/* Parse error */}
      {parseError && (
        <div
          role="alert"
          className="card bg-red-950/30 border-red-800 p-4 mb-6 text-sm text-red-400"
        >
          {parseError}
        </div>
      )}

      {/* Verification result */}
      {result && <VerificationResultCard result={result} />}

      {/* CLI hint (shown before any result) */}
      {!result && !loading && (
        <div className="card bg-slate-900 p-5">
          <h3 className="font-semibold text-white text-sm mb-2">
            Need on-chain verification or automation?
          </h3>
          <p className="text-slate-400 text-sm mb-3">
            Use the standalone CLI verifier — no browser, no server required.
          </p>
          <pre className="text-xs text-slate-300 font-mono bg-slate-950 p-4 rounded-lg overflow-x-auto leading-relaxed">{`# Offline
node apps/verifier-cli/dist/cli.js verify bundle.json

# With Stellar on-chain check
node apps/verifier-cli/dist/cli.js verify bundle.json \\
  --contract-id CABC...XYZ

# Machine-readable JSON
node apps/verifier-cli/dist/cli.js verify bundle.json --json`}</pre>
        </div>
      )}
    </div>
  );
}
