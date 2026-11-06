# ResolveTrace

**Open-source accountability infrastructure built on Stellar and Soroban.**

ResolveTrace records cryptographically linked event histories, anchors commitments on Stellar, and lets anyone independently verify that a record has not been altered — without trusting the organization that produced it.

> **Status: Testnet Preview.**  
> Protocol tests pass. The web app builds and runs. Authentication and persistent event signing are implemented. The Soroban contract is written and unit-tested but requires `rustup` with the `wasm32v1-none` target to compile (see [Contract compilation](#contract-compilation)).  
> This software has not been through a third-party security audit. Do not use it for legally sensitive workflows without one.

---

## What is ResolveTrace?

Organizations manage complaints, approvals, inspections, and other consequential events. Their records live in databases they control. An administrator can alter or delete entries without detection, and a third party cannot distinguish a genuine record from a selectively edited one.

ResolveTrace introduces two things:

1. **ResolveTrace Core** — a reusable protocol: canonical event format, Ed25519 signatures, SHA-256 hash chains, Merkle checkpoints, a policy engine, and an independent verifier. Any developer can use the SDK to add verifiable audit trails to any workflow.

2. **ResolveTrace Cases** — a complaint-resolution application that demonstrates the protocol end-to-end: submit a complaint, assign it, investigate, resolve, appeal. Every state change is a signed event. Batches are committed to Stellar.

### What it proves — and what it doesn't

| Question | Answer |
|---|---|
| Has this record been altered since it was committed? | **Yes** — the hash chain detects any modification |
| Was this event signed by an authorized key? | **Yes** — Ed25519 signatures, verifiable offline |
| Does this commitment exist on the Stellar ledger? | **Yes** — when on-chain verification is run |
| Are the underlying claims in the events true? | **No** — cryptography cannot establish truth |
| Were all events disclosed? | **No** — omissions are not detectable by hash alone |

---

## Repository structure

```
resolvetrace/
│
├── apps/
│   ├── web/                        # Next.js 15 complaint-resolution app
│   │   └── src/
│   │       ├── app/                # Routes (Next.js App Router)
│   │       │   ├── (landing)/      # Landing page layout
│   │       │   ├── (app)/          # App shell (sidebar, nav)
│   │       │   │   ├── dashboard/
│   │       │   │   ├── cases/
│   │       │   │   ├── verify/
│   │       │   │   └── wallet/
│   │       │   └── api/cases/      # REST API routes
│   │       ├── components/
│   │       │   ├── ui/             # Button, Badge, Card, EmptyState
│   │       │   ├── cases/          # CaseActions (client component)
│   │       │   ├── blockchain/     # WalletStatus, CheckpointBadge
│   │       │   └── verification/   # VerificationResultCard
│   │       ├── hooks/              # useWallet (Freighter integration)
│   │       ├── lib/                # store.ts (server-side CaseStore singleton)
│   │       └── types/              # App-level TypeScript types
│   │
│   └── verifier-cli/               # Standalone verification CLI
│       └── src/cli.ts
│
├── contracts/
│   └── resolvetrace_registry/      # Soroban smart contract (Rust)
│       └── src/
│           ├── lib.rs              # Contract logic
│           └── tests.rs            # 21 unit tests
│
├── packages/
│   ├── protocol/                   # Core protocol — browser + Node compatible
│   │   └── src/
│   │       ├── types.ts            # All canonical types
│   │       ├── canonicalize.ts     # RFC 8785 JCS serialization
│   │       ├── hashing.ts          # SHA-256, Merkle tree
│   │       ├── events.ts           # Event creation, signing, hash chain
│   │       ├── checkpoint.ts       # Checkpoint construction + verification
│   │       ├── policy.ts           # Policy engine + default policy
│   │       └── verification.ts     # Independent bundle verifier
│   │
│   ├── sdk/                        # TypeScript SDK for external developers
│   │   └── src/
│   │       ├── workflow.ts         # createCase, advanceWorkflow, anchorCheckpoint
│   │       └── stellar-client.ts  # Soroban RPC client
│   │
│   └── storage/                    # Storage interfaces + adapters
│       └── src/
│           ├── interfaces.ts       # CaseStore interface
│           ├── filesystem.ts       # Local filesystem adapter
│           └── index.ts            # createCaseStoreFromEnv factory
│
├── docs/
│   ├── protocol-spec.md            # Canonical event format, hash scheme
│   ├── architecture.md             # System architecture + data flow
│   ├── threat-model.md             # What is and isn't protected
│   ├── verification-bundle.md      # Bundle schema + verification steps
│   └── roadmap.md                  # Implemented vs planned features
│
├── scripts/
│   ├── demo-e2e.mjs                # Local end-to-end protocol demo
│   ├── generate-demo-key.mjs       # Regenerate the demo signing key pair
│   ├── setup-rust.ps1              # Rust toolchain setup for Windows
│   └── build-all.ps1               # Build all packages in order
│
├── .cargo/config.toml              # Rust build configuration (see notes)
├── .env.example                    # All supported environment variables
├── Cargo.toml                      # Rust workspace
└── package.json                    # npm workspace
```

---

## Prerequisites

| Tool | Version | Required for |
|---|---|---|
| Node.js | ≥ 20 | Everything |
| npm | ≥ 10 | Package management |
| Stellar CLI | ≥ 28 | Contract build + deploy |
| Rust (via **rustup**) | ≥ 1.84 | Contract compilation |
| `wasm32v1-none` target | — | Contract compilation |
| Freighter browser ext | latest | Wallet signing (Testnet only) |

> **Windows note:** The contract requires Rust installed via [rustup.rs](https://rustup.rs), not the standalone Rust installer. The standalone installer does not include the `wasm32v1-none` target. Run `scripts/setup-rust.ps1` for guided setup.

---

## Quick start

```bash
# 1. Clone
git clone https://github.com/Resolve-Trace/Hovibby.git
cd Hovibby

# 2. Install all workspace dependencies
npm install

# 3. Build the packages (protocol, storage, sdk) — required before running the app
npm run build:packages

# 4. Copy environment config
cp .env.example .env.local

# 5. Start the development server
npm run dev        # builds packages then starts Next.js at http://localhost:3000
```

No database. No migrations. No cloud account required.

Cases are stored on the local filesystem at `./resolvetrace-data` by default (relative to where you run the dev server). Change this with `STORAGE_FS_PATH` in `.env.local`.

---

## Running the tests

### Protocol tests (61 tests)

```bash
npm run test:protocol
```

Tests canonicalization, hashing, Ed25519 signing, hash chains, Merkle trees, checkpoints, policy validation, and the independent verifier.

### SDK integration tests (8 tests)

```bash
npm run test:sdk
```

Tests the full case lifecycle: create → assign → acknowledge → build checkpoint → export bundle → verify → detect tampering.

### End-to-end local demo

```bash
node scripts/demo-e2e.mjs
```

Runs the complete protocol without a blockchain connection:
- Creates 3 signed events
- Validates the hash chain
- Builds a Merkle checkpoint
- Verifies the bundle → **VALID**
- Tampers with an event → **BROKEN_HASH_CHAIN**
- Restores the bundle → **VALID**

Expected output:
```
Overall: ALL PASS ✓
```

---

## Building everything

```bash
npm run build          # builds packages + verifier CLI + Next.js app
npm run build:packages # builds protocol, storage, sdk only
npm run build:web      # builds Next.js app only
```

> **Important:** The packages (`@resolvetrace/protocol`, `@resolvetrace/storage`, `@resolvetrace/sdk`) compile TypeScript to `dist/` before the web app can import them. `npm run dev` runs `build:packages` automatically. If you modify a package source file, re-run `npm run build:packages` to reflect changes in the app.

---

## Contract compilation

The Soroban contract requires a proper Rust toolchain.

**If you have rustup** (recommended):
```bash
rustup target add wasm32v1-none
stellar contract build --package resolvetrace_registry
# Output: ~/resolvetrace-target/wasm32v1-none/release/resolvetrace_registry.wasm
```

**Windows setup script:**
```powershell
./scripts/setup-rust.ps1
```

**If you have the standalone Rust LLVM installer** (not rustup):  
This installation does not include the `wasm32v1-none` target. Install Rust via [rustup.rs](https://rustup.rs) instead.

### Contract unit tests

```bash
cargo test --manifest-path contracts/resolvetrace_registry/Cargo.toml --features testutils
```

21 tests covering: registry creation, writer authorization, checkpoint registration, sequence enforcement, previous-checkpoint linking, inactive registry rejection, and all error paths.

> **Note:** Contract tests require the host target (your platform) in addition to wasm, so they need a fully working Rust + linker setup. On Linux/macOS with rustup this works out of the box.

---

## Deploying to Stellar Testnet

```bash
# 1. Generate a key (or use an existing one)
stellar keys generate --global deployer --network testnet

# 2. Fund it
stellar keys fund deployer --network testnet

# 3. Build the contract
stellar contract build --package resolvetrace_registry

# 4. Deploy
stellar contract deploy \
  --wasm ~/resolvetrace-target/wasm32v1-none/release/resolvetrace_registry.wasm \
  --source deployer \
  --network testnet
# → Prints contract ID: CABC...XYZ

# 5. Set the contract ID in your environment
echo "NEXT_PUBLIC_CONTRACT_ID=CABC...XYZ" >> .env.local
```

---

## Using the verification CLI

The CLI verifies a bundle **without accessing this application's server**.

```bash
# Build the CLI
npm run build:cli

# Offline verification (no network needed)
node apps/verifier-cli/dist/cli.js verify path/to/bundle.json

# With on-chain check (compares to Stellar ledger)
node apps/verifier-cli/dist/cli.js verify path/to/bundle.json \
  --contract-id CABC...XYZ \
  --rpc-url https://soroban-testnet.stellar.org

# Inspect bundle contents
node apps/verifier-cli/dist/cli.js inspect path/to/bundle.json

# Machine-readable JSON output
node apps/verifier-cli/dist/cli.js verify path/to/bundle.json --json
```

### Exit codes
| Code | Meaning |
|---|---|
| `0` | `VALID` — bundle is internally consistent |
| `1` | Verification failed (signature, chain, checkpoint mismatch) |
| `2` | Input error (file not found, invalid JSON) |
| `3` | Network unavailable — offline checks passed, on-chain check failed |

---

## SDK — integrating the protocol into your own app

The SDK lets you add verifiable event histories to any workflow without using the ResolveTrace Cases frontend.

```bash
npm install @resolvetrace/sdk
```

```typescript
import {
  FilesystemCaseStore,
  createCase,
  advanceWorkflow,
  buildCaseCheckpoint,
  exportVerificationBundle,
  verifyCase,
  EventType,
  ActorRole,
  CaseCategory,
  CasePriority,
  VerificationStatus,
} from "@resolvetrace/sdk";

// 1. Create a store
const store = new FilesystemCaseStore({
  type: "filesystem",
  basePath: "./my-cases",
});

// 2. Create a case (generates a signed CASE_CREATED event)
const { caseId } = await createCase(store, {
  organizationId: "acme-corp",
  registryId: "acme-complaints",
  title: "Service disruption on 2026-11-05",
  category: CaseCategory.SERVICE_FAILURE,
  priority: CasePriority.HIGH,
  description: "...",                     // stored off-chain only
  reporterRef: "alice@acme.com",
  reporterPublicKey: alicePublicKeyHex,
  signingKeyHex: alicePrivateKeyHex,
});

// 3. Advance the workflow
await advanceWorkflow(store, {
  caseId,
  actorId: "officer-bob",
  actorRole: ActorRole.OFFICER,
  actorPublicKey: bobPublicKeyHex,
  eventType: EventType.CASE_ACKNOWLEDGED,
  payload: {},
  signingKeyHex: bobPrivateKeyHex,
});

// 4. Build a local checkpoint (Merkle root of all events)
await buildCaseCheckpoint(store, caseId);

// 5. Export for independent verification
const bundle = await exportVerificationBundle(store, caseId);

// 6. Verify offline — no network needed
const result = await verifyCase(bundle);
console.log(result.status);   // "VALID"
console.log(result.summary);  // "All 2 events passed..."

// 7. Verify on-chain (optional — requires deployed contract)
const resultWithChain = await verifyCase(bundle, stellarClient, contractId);
```

---

## Environment variables

All variables with defaults shown. Copy `.env.example` to `.env.local` and override as needed.

### Security (new — required for production)

```bash
# API authentication — protects all /api/* routes
# Generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
SERVER_API_KEY=                     # Required in production; optional in dev (open with warning)

# Persistent Ed25519 signing key — events are permanently verifiable
# Generate: node scripts/generate-signing-key.mjs
SERVER_SIGNING_KEY_HEX=             # Required in production; optional in dev (ephemeral with warning)
```

### Required for Testnet anchoring

```bash
NEXT_PUBLIC_CONTRACT_ID=            # Set after: stellar contract deploy
```

### Storage

```bash
STORAGE_ADAPTER=filesystem          # "filesystem" | "s3"
STORAGE_FS_PATH=./resolvetrace-data # Local storage path (filesystem adapter)

# S3-compatible (only when STORAGE_ADAPTER=s3)
STORAGE_S3_ENDPOINT=
STORAGE_S3_BUCKET=
STORAGE_S3_REGION=
STORAGE_S3_ACCESS_KEY_ID=
STORAGE_S3_SECRET_ACCESS_KEY=
```

### Stellar network

```bash
NEXT_PUBLIC_STELLAR_NETWORK=testnet
NEXT_PUBLIC_STELLAR_RPC_URL=https://soroban-testnet.stellar.org
NEXT_PUBLIC_STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE=Test SDF Network ; September 2015
```

### Application

```bash
NEXT_PUBLIC_DEMO_MODE=false         # true = show labeled demo cases
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_PROTOCOL_VERSION=1
```

> ⚠️ Never commit `.env.local`. It is already in `.gitignore`.

---

## Deployment

### Single-instance (Vercel, fly.io, VPS)

The filesystem adapter works for single-instance deployments. Set `STORAGE_FS_PATH` to a persistent volume path.

**Vercel note:** Serverless functions have ephemeral filesystems. You must use `STORAGE_ADAPTER=s3` on Vercel.

### Multi-instance / horizontal scaling

The filesystem adapter is **not shared** across instances. Each server only sees its own disk. Set `STORAGE_ADAPTER=s3` and configure the S3 variables. Any S3-compatible service works (AWS S3, Cloudflare R2, MinIO).

```bash
STORAGE_ADAPTER=s3
STORAGE_S3_ENDPOINT=https://your-bucket.r2.cloudflarestorage.com
STORAGE_S3_BUCKET=resolvetrace-cases
STORAGE_S3_REGION=auto
STORAGE_S3_ACCESS_KEY_ID=...
STORAGE_S3_SECRET_ACCESS_KEY=...
```

---

## Architecture in brief

```
Browser / CLI
     │
     ▼
Next.js API routes          ← server-only (Node.js)
     │
     ├── @resolvetrace/storage   ← CaseStore (filesystem or S3)
     │        └── events.jsonl   ← append-only, one SignedEvent per line
     │
     └── @resolvetrace/protocol  ← pure functions, browser + Node compatible
              ├── canonicalize   RFC 8785 JCS
              ├── hashing        SHA-256 + Merkle tree (domain-separated)
              ├── events         Ed25519 signing + hash chain
              ├── checkpoint     Merkle root → batchCommitment
              └── verification   offline + on-chain bundle check
                                       │
                                       ▼
                              Soroban contract (Stellar)
                              register_checkpoint(registryId, seq, commitment)
```

**What goes on-chain:** only the 32-byte Merkle commitment, registry ID, checkpoint sequence, and writer address. No complaint descriptions, names, email addresses, or evidence files.

**What stays off-chain:** everything else — events, payloads, evidence files, case metadata.

---

## Known limitations

| Limitation | Detail |
|---|---|
| Not audited | No third-party security audit has been performed |
| Multi-org auth | Per-user authentication is a shared API key — sufficient for single-org use; replace with per-user auth (Clerk, Auth.js) for multi-tenant deployments |
| No encryption at rest | Off-chain storage is plaintext JSON. Use encrypted volumes or S3 bucket encryption for sensitive data |
| Single-org only | Multi-organization isolation at the API level is not implemented in v1 |
| No S3 adapter | The S3 storage adapter interface is defined but not implemented (throws descriptive error) |
| Filesystem not shared | The filesystem adapter is not safe for horizontally scaled deployments |
| Testnet only | Do not deploy to Stellar Mainnet |
| Contract tests on Windows | Require a working host-target Rust linker; use Linux/macOS or WSL for full contract test runs |

---

## Security

To report a vulnerability, open a private Security Advisory on your repository host, or email `security@[your-domain]`.

See [`SECURITY.md`](./SECURITY.md) for the full policy.

---

## Contributing

See [`CONTRIBUTING.md`](./CONTRIBUTING.md).

**Key rules:**
- No database dependencies
- No sensitive data on-chain
- No invented cryptographic primitives
- All new protocol behavior must have tests
- Keep the core protocol independent of the web app

---

## Documentation

| Document | What it covers |
|---|---|
| [`docs/protocol-spec.md`](./docs/protocol-spec.md) | Canonical event format, hash scheme, serialization |
| [`docs/architecture.md`](./docs/architecture.md) | System architecture, data flow diagrams |
| [`docs/threat-model.md`](./docs/threat-model.md) | What is detectable, what is prevented, residual risks |
| [`docs/verification-bundle.md`](./docs/verification-bundle.md) | Bundle schema, verification algorithm, what VALID means |
| [`docs/roadmap.md`](./docs/roadmap.md) | Implemented vs planned features |

---

## License

MIT — see [`LICENSE`](./LICENSE).
