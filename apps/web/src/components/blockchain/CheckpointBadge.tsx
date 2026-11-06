/**
 * Displays the on-chain anchoring status of a checkpoint.
 *
 * Clearly distinguishes between:
 *   - No checkpoint (events are locally recorded only)
 *   - Local checkpoint (built, not yet submitted to Stellar)
 *   - Confirmed checkpoint (transaction confirmed on Stellar ledger)
 *
 * IMPORTANT: Never display "on-chain confirmed" unless a real Stellar
 * transaction has been confirmed. A locally built checkpoint is NOT
 * independently verifiable until it is confirmed on the ledger.
 */

interface CheckpointBadgeProps {
  /** undefined = no checkpoint at all */
  sequence?: number;
  /** true = confirmed on Stellar ledger; false/undefined = local only */
  confirmed?: boolean;
  txHash?: string;
}

export function CheckpointBadge({ sequence, confirmed, txHash }: CheckpointBadgeProps) {
  if (sequence === undefined) {
    return (
      <span className="badge badge-slate text-xs" title="No checkpoint — not yet independently verifiable">
        No checkpoint
      </span>
    );
  }

  if (confirmed && txHash) {
    return (
      <a
        href={`https://stellar.expert/explorer/testnet/tx/${txHash}`}
        target="_blank"
        rel="noreferrer"
        className="badge badge-green text-xs hover:underline"
        title="Checkpoint confirmed on Stellar Testnet — independently verifiable"
      >
        ⛓ Anchored #{sequence}
      </a>
    );
  }

  return (
    <span
      className="badge badge-yellow text-xs"
      title="Checkpoint built locally — submit via wallet to anchor on Stellar"
    >
      ⛓ Local #{sequence}
    </span>
  );
}
