/**
 * Renders a structured VerificationResult from the protocol verifier.
 * Used in both the web verify page and case detail.
 */
import type { VerificationResult } from "@resolvetrace/protocol";
import { VerificationStatus } from "@resolvetrace/protocol";

interface Props {
  result: VerificationResult;
}

export function VerificationResultCard({ result }: Props) {
  const isValid = result.status === VerificationStatus.VALID;
  const isWarning = result.status === VerificationStatus.UNANCHORED_EVENTS ||
    result.status === VerificationStatus.NETWORK_UNAVAILABLE;
  const isFailed = !isValid && !isWarning;

  const icon = isValid ? "✅" : isWarning ? "⚠️" : "❌";
  const borderColor = isValid
    ? "border-emerald-800 bg-emerald-950/30"
    : isWarning
    ? "border-amber-800 bg-amber-950/20"
    : "border-red-800 bg-red-950/30";

  return (
    <div className={`card p-5 ${borderColor}`}>
      <div className="flex items-center gap-3 mb-3">
        <span className="text-xl">{icon}</span>
        <div>
          <p className="font-semibold text-white text-sm">{result.status}</p>
          <p className="text-xs text-slate-400 mt-0.5">{result.summary}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs mb-3">
        <Stat label="Events" value={String(result.totalEvents)} />
        <Stat label="Network checked" value={result.networkUsed ? "Yes" : "No"} />
        <Stat label="Protocol v" value={String(result.protocolVersion)} />
        <Stat label="Checked" value={new Date(result.checkedAt).toLocaleTimeString()} />
      </div>

      {result.checkpointResult && (
        <div className="border-t border-slate-800 pt-3 mt-3 text-xs space-y-1">
          <p className="text-slate-500 font-medium">Checkpoint #{result.checkpointResult.checkpointSequence}</p>
          <Stat label="Local commitment" value={result.checkpointResult.localCommitmentValid ? "✅ Valid" : "❌ Invalid"} />
          {result.checkpointResult.onChainMatch !== undefined && (
            <Stat label="On-chain match" value={result.checkpointResult.onChainMatch ? "✅ Match" : "❌ Mismatch"} />
          )}
        </div>
      )}

      {result.errors.length > 0 && (
        <div className="border-t border-red-900 pt-3 mt-3">
          <p className="text-red-400 text-xs font-medium mb-1">Errors</p>
          <ul className="space-y-0.5">
            {result.errors.map((e, i) => (
              <li key={i} className="text-xs text-red-300">❌ {e}</li>
            ))}
          </ul>
        </div>
      )}

      {result.warnings.length > 0 && (
        <div className="border-t border-amber-900 pt-3 mt-3">
          <p className="text-amber-400 text-xs font-medium mb-1">Warnings</p>
          <ul className="space-y-0.5">
            {result.warnings.slice(0, 3).map((w, i) => (
              <li key={i} className="text-xs text-amber-300">⚠️ {w}</li>
            ))}
            {result.warnings.length > 3 && (
              <li className="text-xs text-slate-500">+{result.warnings.length - 3} more</li>
            )}
          </ul>
        </div>
      )}

      <p className="text-xs text-slate-600 mt-3 border-t border-slate-800 pt-3">
        VALID means this bundle is internally consistent — not that all events were disclosed or that claims are true.
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-slate-500">{label}: </span>
      <span className="text-slate-300">{value}</span>
    </div>
  );
}
