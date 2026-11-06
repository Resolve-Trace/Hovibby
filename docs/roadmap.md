# ResolveTrace Roadmap

This roadmap distinguishes what has been implemented from what is planned.

---

## ✅ Implemented (v0.1 — this release)

### Protocol

- [x] RFC 8785 JCS canonical serialization (browser and Node.js compatible)
- [x] SHA-256 event hashing with domain separation
- [x] Hash-linked event chains
- [x] Ed25519 signatures on events
- [x] Merkle tree batch commitment (leaf/node domain separation)
- [x] Checkpoint format with previous-checkpoint chaining
- [x] Default complaint-resolution policy (12 state transitions)
- [x] Policy validation engine
- [x] Offline bundle verification
- [x] Structured verification results with status codes
- [x] `VerificationBundle` export format

### Soroban Contract

- [x] Registry creation with authorized controller
- [x] Writer authorization management
- [x] Checkpoint registration with sequence enforcement
- [x] Previous checkpoint commitment validation
- [x] Registry deactivation
- [x] Contract unit tests (21 tests covering all paths)
- [x] Contract source code (compilation requires rustup + wasm32v1-none)

### TypeScript SDK

- [x] `createCase` — creates a case with an initial signed event
- [x] `advanceWorkflow` — records events with policy validation
- [x] `buildCaseCheckpoint` — constructs a checkpoint from events
- [x] `exportVerificationBundle` — exports a self-contained bundle
- [x] `verifyCase` — independent offline verification
- [x] `StellarClient` — Soroban RPC client for checkpoint submission
- [x] SDK integration tests

### Storage

- [x] `CaseStore` interface
- [x] Filesystem adapter with atomic writes
- [x] Evidence file storage
- [x] Bundle export
- [x] Health check

### Web Application

- [x] Landing page with honest project description
- [x] Dashboard with real case data
- [x] Case creation form
- [x] Case detail with event timeline
- [x] Workflow action buttons (client-side)
- [x] Bundle verification page
- [x] Wallet connection page (Freighter)
- [x] REST API (cases CRUD, events, checkpoint, bundle)
- [x] Next.js 15 production build

### Independent Verifier CLI

- [x] `verify` command with offline verification
- [x] `inspect` command with bundle contents
- [x] `version` command
- [x] JSON output mode (`--json`)
- [x] On-chain check support (`--contract-id`)
- [x] Human-readable verification certificate

### Documentation

- [x] README with complete setup guide
- [x] Protocol specification
- [x] Architecture document
- [x] Threat model
- [x] Verification bundle specification
- [x] Security policy
- [x] Contributing guide
- [x] This roadmap

---

## 🔲 Planned (v0.2)

### Contract

- [ ] Deploy to Stellar Testnet (requires rustup toolchain)
- [ ] Contract Testnet integration tests
- [ ] Contract upgrade pattern documentation
- [ ] Key rotation procedure

### Protocol

- [ ] Merkle inclusion proofs in verification bundles
- [ ] Policy versioning with backward compatibility rules
- [ ] Event omission detection (requires co-signing observers)
- [ ] Anonymous reporting with unlinkable pseudonyms

### SDK

- [ ] `anchorCheckpoint` end-to-end Testnet test
- [ ] Wallet-signing flow tested against real Freighter
- [ ] Soroban contract bindings (auto-generated with `stellar contract bindings`)

### Storage

- [ ] S3-compatible adapter implementation
- [ ] Storage migration helper
- [ ] Encrypted storage adapter (AES-256-GCM)

### Web Application

- [ ] Evidence file upload with content hashing
- [ ] Deadline tracking with overdue indicators
- [ ] Escalation automation
- [ ] Appeal assignment UI
- [ ] Real Stellar transaction status display
- [ ] Confirmed on-chain checkpoint display with explorer link
- [ ] Multi-organization isolation
- [ ] Authentication layer (Clerk or similar)
- [ ] Dark/light mode toggle

### Operations

- [ ] CI/CD pipeline (GitHub Actions)
- [ ] Docker compose for local multi-service demo
- [ ] Deployment guide for shared S3 deployments
- [ ] API documentation (OpenAPI)

---

## 🔲 Longer-term (v1.0+)

### Protocol Extensions

- [ ] Multi-party signing (M-of-N authorization)
- [ ] Observer nodes that independently anchor checkpoints
- [ ] Cross-organization verification
- [ ] Protocol registry on Stellar (policy versioning)

### SDK Extensions

- [ ] Go SDK
- [ ] Python SDK

### Additional Workflow Templates

- [ ] Inventory movement audit
- [ ] Attendance attestation
- [ ] Delivery and inspection records
- [ ] Grant milestone approvals

### Security

- [ ] Third-party security audit
- [ ] Formal verification of key protocol properties
- [ ] Bug bounty program

---

## ❌ Explicitly Out of Scope (v1)

- Token incentives or cryptocurrency payments
- Mainnet deployment (Testnet only)
- Decentralized identity (DID) integration
- Legal admissibility certification
- Production SaaS offering
- Smart contract upgradeability patterns
