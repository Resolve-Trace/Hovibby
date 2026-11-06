/**
 * ResolveTrace Landing Page
 *
 * This is a static page — no blockchain connections or database queries.
 * All information presented here is accurate to the current state of the project.
 */

import Link from "next/link";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Header */}
      <header className="border-b border-slate-800 sticky top-0 z-50 backdrop-blur-sm bg-slate-950/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center">
              <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5 text-white" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
              </svg>
            </div>
            <span className="font-semibold text-white text-lg">ResolveTrace</span>
            <span className="badge badge-yellow text-xs">Testnet Preview</span>
          </div>

          <nav className="hidden md:flex items-center gap-6">
            <a href="#how-it-works" className="text-sm text-slate-400 hover:text-white transition-colors">How it works</a>
            <a href="#protocol" className="text-sm text-slate-400 hover:text-white transition-colors">Protocol</a>
            <a href="#sdk" className="text-sm text-slate-400 hover:text-white transition-colors">SDK</a>
            <Link href="/dashboard" className="btn-primary text-sm">
              Open App
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-16">
        <div className="text-center max-w-4xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-950 border border-brand-800 text-brand-400 text-sm mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-pulse-slow"></span>
            Open-source accountability infrastructure on Stellar
          </div>

          <h1 className="text-5xl sm:text-6xl font-bold text-white leading-tight mb-6">
            Audit trails that can be{" "}
            <span className="text-brand-400">independently verified</span>
          </h1>

          <p className="text-xl text-slate-400 mb-10 max-w-3xl mx-auto leading-relaxed">
            ResolveTrace records cryptographically linked event histories,
            anchors commitments on Stellar, and lets anyone independently
            verify that a record hasn&apos;t been altered — without trusting
            the organization that produced it.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-4">
            <a href="/dashboard" className="btn-primary px-6 py-3 text-base">
              Try the demo →
            </a>
          </div>
        </div>
      </section>

      {/* Problem section */}
      <section className="border-t border-slate-800 py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-3xl font-bold text-white mb-6">The accountability problem</h2>
            <div className="space-y-4 text-slate-400 text-lg leading-relaxed">
              <p>
                Organizations manage complaints, approvals, inspections, and other
                consequential events. Their records live in databases controlled
                by the same organization being audited.
              </p>
              <p>
                An administrator can alter, delete, or reorder entries. A third
                party cannot distinguish a genuine record from a selectively
                edited one. Audit logs produced by the accused are not
                independently trustworthy.
              </p>
            </div>

            <div className="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-6">
              {[
                {
                  label: "Integrity",
                  question: "Has the record changed?",
                  answer: "Cryptographic hash chains detect unauthorized modifications to committed events.",
                  color: "green",
                },
                {
                  label: "Authenticity",
                  question: "Was this signed by an authorized actor?",
                  answer: "Ed25519 signatures on each event prove which key created it — under defined cryptographic assumptions.",
                  color: "blue",
                },
                {
                  label: "Truth",
                  question: "Is the underlying claim true?",
                  answer: "Cryptography cannot establish this. ResolveTrace makes tampering detectable, not claims verifiable.",
                  color: "slate",
                },
              ].map((item) => (
                <div key={item.label} className="card p-5 bg-slate-900">
                  <div className={`badge badge-${item.color} mb-3`}>{item.label}</div>
                  <p className="text-sm font-medium text-white mb-2">{item.question}</p>
                  <p className="text-xs text-slate-500">{item.answer}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="border-t border-slate-800 py-24 bg-slate-925/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-white mb-12 text-center">How ResolveTrace works</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                step: "01",
                title: "Events are recorded",
                desc: "Each action in a workflow — a complaint submission, assignment, decision — creates a signed event with a canonical hash.",
              },
              {
                step: "02",
                title: "Hash chain is formed",
                desc: "Each event commits to the hash of its predecessor, forming a tamper-evident chain. Changing any event breaks the chain.",
              },
              {
                step: "03",
                title: "Checkpoint anchored on Stellar",
                desc: "A Merkle commitment to a batch of events is written to a Soroban contract. The Stellar ledger provides an independent timestamp.",
              },
              {
                step: "04",
                title: "Independent verification",
                desc: "Anyone can export a verification bundle and run the CLI verifier — no access to the original system required.",
              },
            ].map((item) => (
              <div key={item.step} className="card bg-slate-900 p-6">
                <div className="text-brand-400 font-mono text-sm mb-3">{item.step}</div>
                <h3 className="font-semibold text-white mb-2">{item.title}</h3>
                <p className="text-sm text-slate-400">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Protocol section */}
      <section id="protocol" className="border-t border-slate-800 py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <h2 className="text-3xl font-bold text-white mb-4">Why private data stays off-chain</h2>
            <p className="text-slate-400 mb-8 text-lg">
              Complaint descriptions, names, and evidence are confidential.
              They must not appear on a public blockchain. ResolveTrace records
              only cryptographic commitments on-chain — hashes that prove
              a record existed without revealing its content.
            </p>

            <div className="card bg-slate-900 p-6 font-mono text-sm">
              <div className="text-slate-500 mb-2">{/* What goes on-chain */}</div>
              <div className="space-y-1">
                <div className="text-emerald-400">✓ Registry identifier</div>
                <div className="text-emerald-400">✓ Authorized writer address</div>
                <div className="text-emerald-400">✓ Checkpoint sequence number</div>
                <div className="text-emerald-400">✓ 32-byte Merkle commitment</div>
                <div className="text-emerald-400">✓ Previous checkpoint reference</div>
                <div className="mt-4 text-red-400">✗ Complaint description</div>
                <div className="text-red-400">✗ Reporter name or contact info</div>
                <div className="text-red-400">✗ Evidence files</div>
                <div className="text-red-400">✗ Officer notes</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SDK section */}
      <section id="sdk" className="border-t border-slate-800 py-24 bg-slate-925/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <h2 className="text-3xl font-bold text-white mb-4">Open-source SDK</h2>
            <p className="text-slate-400 mb-8 text-lg">
              The <code className="text-brand-400">@resolvetrace/sdk</code> package
              lets developers integrate verifiable event histories into any workflow —
              without using the ResolveTrace Cases frontend.
            </p>

            <div className="card bg-slate-900 p-6 overflow-x-auto">
              <pre className="text-sm text-slate-300 font-mono">{`import {
  createCase,
  advanceWorkflow,
  buildCaseCheckpoint,
  exportVerificationBundle,
  verifyCase,
  FilesystemCaseStore,
} from "@resolvetrace/sdk";

// Create a case
const { caseId } = await createCase(store, {
  organizationId: "acme-corp",
  registryId: "acme-complaints",
  title: "Service disruption complaint",
  category: CaseCategory.SERVICE_FAILURE,
  priority: CasePriority.HIGH,
  // ...
  signingKeyHex: actorPrivateKey,
});

// Build and anchor a checkpoint
const checkpoint = await buildCaseCheckpoint(store, caseId);
await anchorCheckpoint(store, { caseId, writerPublicKey, signTransaction, stellarClient });

// Independent verification
const bundle = await exportVerificationBundle(store, caseId);
const result = await verifyCase(bundle);
console.log(result.status); // "VALID"`}</pre>
            </div>
          </div>
        </div>
      </section>


      {/* Footer */}
      <footer className="border-t border-slate-800 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row justify-between items-start gap-8">
            <div>
              <div className="font-semibold text-white mb-2">ResolveTrace</div>
              <p className="text-sm text-slate-500 max-w-sm">
                Open-source accountability infrastructure built on Stellar and Soroban.
                MIT licensed.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-8 text-sm">
              <div>
                <div className="text-slate-400 font-medium mb-3">Project</div>
                <div className="space-y-2">
                  <a href="/dashboard" className="block text-slate-500 hover:text-slate-300">App</a>
                  <a href="/docs/protocol" className="block text-slate-500 hover:text-slate-300">Protocol spec</a>
                </div>
              </div>
              <div>
                <div className="text-slate-400 font-medium mb-3">Legal</div>
                <div className="space-y-2">
                  <a href="/security" className="block text-slate-500 hover:text-slate-300">Security policy</a>
                  <span className="block text-slate-600">MIT License</span>
                  <span className="block text-slate-600">Not audited</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
