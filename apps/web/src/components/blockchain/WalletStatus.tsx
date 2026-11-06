"use client";

interface WalletStatusProps {
  publicKey?: string;
  network?: string;
  connected: boolean;
}

export function WalletStatus({ publicKey, network, connected }: WalletStatusProps) {
  if (!connected) {
    return (
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <span className="w-1.5 h-1.5 rounded-full bg-slate-600" />
        No wallet
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 text-xs text-emerald-400">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
      <span className="font-mono">{publicKey?.slice(0, 8)}…</span>
      {network && <span className="text-slate-500">· {network}</span>}
    </div>
  );
}
