/**
 * App shell layout — sidebar navigation + main content area
 */

import Link from "next/link";
import type { ReactNode } from "react";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-950 flex">
      {/* Sidebar */}
      <aside className="w-64 border-r border-slate-800 flex-col shrink-0 hidden md:flex">
        {/* Logo */}
        <div className="h-16 border-b border-slate-800 flex items-center px-6 gap-3">
          <div className="w-7 h-7 rounded-lg bg-brand-600 flex items-center justify-center shrink-0">
            <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4 text-white" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
            </svg>
          </div>
          <div>
            <div className="text-sm font-semibold text-white leading-none">ResolveTrace</div>
            <div className="text-[10px] text-slate-500 leading-none mt-0.5">Cases</div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 px-3 space-y-1">
          <NavLink href="/dashboard" icon="📊">Dashboard</NavLink>
          <NavLink href="/cases" icon="📋">Cases</NavLink>
          <NavLink href="/cases/new" icon="➕">New Case</NavLink>

          <div className="pt-4 pb-1 px-3">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-600">
              Protocol
            </div>
          </div>
          <NavLink href="/verify" icon="🔍">Verify Bundle</NavLink>

          <div className="pt-4 pb-1 px-3">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-600">
              Blockchain
            </div>
          </div>
          <NavLink href="/wallet" icon="🔗">Wallet</NavLink>
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800">
          <div className="badge badge-yellow text-xs w-full justify-center">
            Testnet Preview
          </div>
          <p className="text-[10px] text-slate-600 text-center mt-2">
            Not audited · Not production-ready
          </p>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}

function NavLink({
  href,
  icon,
  children,
}: {
  href: string;
  icon: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-400
                 hover:text-white hover:bg-slate-800 transition-colors"
    >
      <span className="text-base leading-none">{icon}</span>
      {children}
    </Link>
  );
}
