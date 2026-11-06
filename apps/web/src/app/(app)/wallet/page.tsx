"use client";

import { useWallet } from "@/hooks/useWallet";
import { CheckpointBadge } from "@/components/blockchain/CheckpointBadge";

export default function WalletPage() {
  const { wallet, loading, connect, disconnect } = useWallet();

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Wallet</h1>
        <p className="text-sm text-slate-400 mt-1">
          Connect your Stellar wallet to anchor checkpoints on-chain
        </p>
      </div>

      {/* Connection card */}
      <div className="card bg-slate-900 p-6 mb-6">
        {wallet.connected ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full bg-emerald-400" />
              <span className="text-emerald-400 font-medium">Connected</span>
            </div>

            <div className="space-y-2 text-sm bg-slate-950/50 rounded-lg p-4">
              <Row label="Public key">
                <span className="font-mono text-xs text-slate-300 break-all">
                  {wallet.publicKey}
                </span>
              </Row>
              <Row label="Network">
                <span className="text-slate-300">{wallet.network}</span>
              </Row>
            </div>

            <button onClick={disconnect} className="btn-secondary text-xs">
              Disconnect
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full bg-slate-600" />
              <span className="text-slate-400">Not connected</span>
            </div>

            {wallet.error && (
              <div className="card bg-red-950/40 border-red-800 p-3 text-xs text-red-300">
                {wallet.error}
              </div>
            )}

            <button
              onClick={connect}
              disabled={loading}
              className="btn-primary"
            >
              {loading ? "Connecting…" : "Connect Freighter Wallet"}
            </button>
          </div>
        )}
      </div>

      {/* What wallet signing does */}
      <div className="card bg-slate-900 p-5 space-y-4 text-sm mb-4">
        <h3 className="font-semibold text-white">What wallet signing does</h3>
        <p className="text-slate-400 leading-relaxed">
          When you anchor a checkpoint, your wallet signs a transaction that
          records the cryptographic commitment (Merkle root of your event
          batch) in the ResolveTrace Registry contract on Stellar. The ledger
          provides a tamper-resistant timestamp and an independent copy of
          the commitment that anyone can verify — without trusting this server.
        </p>
        <p className="text-slate-400 leading-relaxed">
          Your private key never leaves Freighter. This page only requests
          your public address and asks Freighter to sign a prepared transaction.
        </p>
      </div>

      {/* Transaction states */}
      <div className="card bg-slate-900 p-5 text-sm mb-4">
        <h3 className="font-semibold text-white mb-3">Transaction states</h3>
        <div className="space-y-2 text-xs">
          {[
            ["Building", "Transaction being prepared from checkpoint data"],
            ["Awaiting wallet", "Waiting for you to approve in Freighter"],
            ["Submitted", "Sent to the Stellar network — NOT yet confirmed"],
            ["Confirmed", "Included in a finalized ledger ✅"],
            ["Timeout", "No confirmation received — may still land in a later ledger"],
            ["Failed", "Rejected by the network"],
          ].map(([state, desc]) => (
            <div key={state} className="flex gap-3">
              <span className="text-slate-400 w-28 shrink-0">{state}</span>
              <span className="text-slate-500">{desc}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-amber-400 mt-3">
          ⚠ A submitted transaction is NOT a confirmed transaction. Only a confirmed
          transaction is independently verifiable on Stellar.
        </p>
      </div>

      {/* Setup checklist */}
      <div className="card bg-slate-900 p-5 text-sm">
        <h3 className="font-semibold text-white mb-3">Setup checklist</h3>
        <ul className="space-y-2 text-slate-400">
          <li className="flex items-start gap-2">
            <span className="text-brand-400 mt-0.5 shrink-0">1.</span>
            <span>
              Install{" "}
              <a href="https://www.freighter.app/" target="_blank" rel="noreferrer"
                className="text-brand-400 hover:underline">
                Freighter
              </a>{" "}
              browser extension
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-brand-400 mt-0.5 shrink-0">2.</span>
            <span>Switch Freighter to <strong className="text-white">Stellar Testnet</strong></span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-brand-400 mt-0.5 shrink-0">3.</span>
            <span>
              Fund with Testnet XLM via{" "}
              <a href="https://friendbot.stellar.org" target="_blank" rel="noreferrer"
                className="text-brand-400 hover:underline">
                Friendbot
              </a>
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-brand-400 mt-0.5 shrink-0">4.</span>
            <span>
              Deploy contract and set <code className="text-brand-400">NEXT_PUBLIC_CONTRACT_ID</code> in{" "}
              <code className="text-slate-300">.env.local</code>
            </span>
          </li>
        </ul>

        <div className="mt-4 pt-4 border-t border-slate-800">
          <span className="badge badge-yellow text-xs">Testnet only</span>
          <p className="text-xs text-slate-600 mt-2">
            ResolveTrace is experimental. Do not use Mainnet.
          </p>
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-slate-500 w-20 shrink-0 text-xs pt-0.5">{label}</span>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
