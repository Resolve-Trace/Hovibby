# ResolveTrace Architecture

## Overview

ResolveTrace is a monorepo containing four layers:

```
┌─────────────────────────────────────────────────────────┐
│                   apps/web (Next.js)                     │
│          Complaint-resolution application UI             │
├─────────────────────────────────────────────────────────┤
│                 packages/sdk                             │
│    High-level workflow + Stellar client integration      │
├───────────────────┬─────────────────────────────────────┤
│  packages/protocol│       packages/storage               │
│  Event format,    │  CaseStore interface + adapters      │
│  hashing, signing,│  (filesystem, S3)                    │
│  policy engine,   │                                      │
│  verification     │                                      │
├───────────────────┴─────────────────────────────────────┤
│              contracts/resolvetrace_registry             │
│                  Soroban smart contract (Rust)           │
└─────────────────────────────────────────────────────────┘
```

## Data Flow

### Creating a case

```
User → POST /api/cases
         ↓
    API route validates input
         ↓
    createUnsignedEvent() — builds canonical event
         ↓
    computePayloadCommitment() — SHA-256(domain||JCS(payload))
         ↓
    computeEventHash() — SHA-256(domain||JCS(event))
         ↓
    signEvent() — Ed25519.sign(domain||eventHash, privKey)
         ↓
    store.saveCase() + store.appendEvent()
         ↓
    Return { caseId, eventHash }
```

### Anchoring a checkpoint

```
Client → POST /api/cases/:id/checkpoint
              ↓
         store.getEvents() → events[]
              ↓
         validateHashChain(events) — must pass
              ↓
         buildCheckpoint() → computeMerkleRoot(eventHashes)
              ↓
         store.saveCheckpoint()
              ↓
         Client displays: "checkpoint built locally"
              ↓
         [Wallet flow — NOT automated by API]
         buildRegisterCheckpointTx() → Transaction XDR
              ↓
         Freighter.sign(xdr) → signedXdr
              ↓
         rpc.sendTransaction(signedTx) → txHash
              ↓
         rpc.getTransaction(txHash) → CONFIRMED
              ↓
         Client displays: "checkpoint confirmed on Stellar"
```

### Independent verification

```
User → resolvetrace-verify verify bundle.json
              ↓
         Load VerificationBundle from file
              ↓
         Check protocolVersion
              ↓
         For each event:
           recompute eventHash = SHA-256(domain||JCS(event))
           verify signature = Ed25519.verify(sig, domain||hash, pubKey)
           verify chain link = event.previousEventHash == prev.eventHash
              ↓
         Recompute batchCommitment from event hashes
         Compare to checkpoint.batchCommitment
              ↓
         [Optional — if --contract-id provided]:
           rpc.simulateTransaction(get_checkpoint(registryId, seq))
           Compare on-chain commitment to local batchCommitment
              ↓
         Return VerificationResult with full breakdown
```

## Package Responsibilities

### packages/protocol

Pure functions. No I/O. No network. Browser-compatible.

- `canonicalize.ts` — RFC 8785 JCS implementation
- `hashing.ts` — SHA-256, Merkle tree, toHex/fromHex
- `events.ts` — event construction, signing, hash chain validation
- `checkpoint.ts` — checkpoint construction and verification
- `policy.ts` — policy validation and transition rules
- `verification.ts` — bundle verification (offline + on-chain interface)
- `types.ts` — all TypeScript types

### packages/storage

Node.js only. Filesystem I/O.

- `interfaces.ts` — CaseStore, EvidenceRef, StorageConfig interfaces
- `filesystem.ts` — Local filesystem adapter
- `index.ts` — createCaseStore factory

### packages/sdk

Ties protocol + storage + Stellar together.

- `stellar-client.ts` — Stellar RPC client, transaction builder
- `workflow.ts` — createCase, advanceWorkflow, buildCaseCheckpoint, anchorCheckpoint
- `index.ts` — re-exports everything

### contracts/resolvetrace_registry

Soroban contract in Rust.

- `lib.rs` — registry creation, writer authorization, checkpoint registration
- `tests.rs` — unit tests for all operations

### apps/web

Next.js 15 application.

- `app/(app)/` — authenticated app shell
  - `dashboard/` — case overview
  - `cases/` — case list and detail
  - `verify/` — bundle verification
  - `wallet/` — Freighter wallet connection
- `app/api/cases/` — REST API routes
- `lib/store.ts` — server-side CaseStore singleton

### apps/verifier-cli

Standalone CLI tool. Uses built packages from the monorepo.

## Cryptographic Primitives

| Purpose | Algorithm | Library |
|---------|-----------|---------|
| Hashing | SHA-256 | @noble/hashes |
| Signing | Ed25519 | @noble/ed25519 |
| Canonicalization | RFC 8785 JCS | inline implementation |
| Merkle tree | SHA-256 (custom domain separation) | @noble/hashes |

## Trust Model

```
┌──────────────────────────────────────────────┐
│  Organization controls:                       │
│  - Private signing keys                       │
│  - Off-chain case storage                     │
│  - Event submission                           │
│                                               │
│  Verifier can check:                          │
│  - Event hashes (tamper detection)            │
│  - Signatures (authenticity under assumptions)│
│  - Checkpoint vs on-chain (via Stellar RPC)   │
│                                               │
│  Verifier cannot check:                       │
│  - Event omissions                            │
│  - Truth of underlying claims                 │
│  - Real-world identity of actors             │
└──────────────────────────────────────────────┘
         ↑
         │ Commitment only (no private data)
         ↓
┌──────────────────────────────────────────────┐
│  Stellar / Soroban contract:                  │
│  - Registry state                             │
│  - Writer authorization                       │
│  - Checkpoint sequence + commitment           │
│  - Cannot be altered retroactively            │
└──────────────────────────────────────────────┘
```

## Storage Architecture

Off-chain data is stored by the CaseStore adapter.

### Filesystem layout (local development)

```
resolvetrace-data/
  cases/
    {caseId}/
      manifest.json      ← CaseDocument
      events.jsonl       ← append-only, one SignedEvent per line
      checkpoints/
        1.json           ← Checkpoint
      evidence/
        {evidenceId}/
          {safeName}     ← raw file bytes
```

### Important constraints

- The filesystem adapter is NOT safe for concurrent writes from multiple processes.
- It is NOT shared across horizontally scaled instances.
- Use `STORAGE_ADAPTER=s3` for multi-instance deployments.
- Storage does not provide cryptographic immutability — the verifier does.

## What Stellar Provides

1. **Immutable ledger timestamp** — when a checkpoint transaction is confirmed, the Stellar ledger sequence provides a tamper-resistant time reference.
2. **Independent commitment record** — the batchCommitment (Merkle root) is stored in the Soroban contract, separated from the organization's control.
3. **Contract-enforced sequencing** — the contract prevents sequence gaps, duplicate registrations, and unauthorized submissions.
4. **Public verifiability** — any party with the Stellar RPC URL and contract ID can retrieve the commitment independently.
