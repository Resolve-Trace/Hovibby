# Verification Bundle Specification

## Purpose

A verification bundle is a portable, self-contained export of a case's event history that allows anyone to independently verify its cryptographic integrity — without accessing the original application server.

## Schema

```typescript
interface VerificationBundle {
  bundleVersion: number;        // Must be 1
  protocolVersion: number;      // Must be 1
  exportedAt: string;           // ISO 8601 UTC
  organizationId: string;
  workflowId: string;
  events: SignedEvent[];
  checkpoint?: Checkpoint;
  authorizationEvidence: Record<string, ActorRole[]>;
  policy: Policy;
}
```

## SignedEvent Schema

```typescript
interface SignedEvent {
  protocolVersion: number;
  eventId: string;              // UUID v4
  organizationId: string;
  workflowId: string;
  sequence: number;             // Starts at 1, contiguous
  eventType: string;
  actorId: string;
  actorPublicKey?: string;      // Ed25519 hex, required for signature verification
  actorRole: string;
  claimedAt: string;            // ISO 8601 UTC (NOT independently verified)
  previousEventHash: string;    // "" for first event; hex SHA-256 of prev event
  payloadCommitment: string;    // hex SHA-256 of payload
  policyVersion: string;
  checkpointRef?: string;
  signature: string;            // hex Ed25519 signature
  eventHash: string;            // hex SHA-256 of canonical event
}
```

## Checkpoint Schema

```typescript
interface Checkpoint {
  protocolVersion: number;
  organizationId: string;
  registryId: string;
  checkpointSequence: number;
  eventSequenceStart: number;
  eventSequenceEnd: number;
  batchCommitment: string;              // hex SHA-256 (single) or Merkle root (batch)
  previousCheckpointCommitment: string; // "" for first
  policyVersion: string;
  claimedAt: string;
  checkpointHash: string;               // hex SHA-256 of above fields (via JCS)
}
```

## Hash Computations

All hashes use SHA-256. All objects are serialized with RFC 8785 JCS before hashing.

### Event hash

```
eventHash = SHA-256("resolvetrace:v1:event:" || JCS(unsignedEvent))
```

where `unsignedEvent` is the `SignedEvent` without the `signature` and `eventHash` fields.

### Payload commitment

```
payloadCommitment = SHA-256("resolvetrace:v1:payload:" || JCS(payload))
```

### Signature

```
signatureInput = "resolvetrace:v1:sig:" || eventHash
signature = Ed25519.sign(signatureInput, privateKey)
```

### Batch commitment (single event)

```
batchCommitment = SHA-256("resolvetrace:v1:checkpoint:" || eventHash)
```

### Batch commitment (multiple events — Merkle root)

```
leaf[i] = SHA-256("resolvetrace:v1:merkle:leaf:" || eventHash[i])
node(L,R) = SHA-256("resolvetrace:v1:merkle:node:" || L || R)
```

Events sorted by sequence. Odd number of leaves: last leaf is duplicated.

### Checkpoint hash

```
checkpointHash = SHA-256(JCS(checkpointWithoutHashField))
```

## Verification Steps

The independent verifier performs these steps in order:

1. **Schema check** — validate that required fields are present and `protocolVersion === 1`.
2. **Event hash recomputation** — for each event, recompute `eventHash` from the unsigned fields and compare to `event.eventHash`.
3. **Signature verification** — for each signed event, verify `Ed25519.verify(signature, "resolvetrace:v1:sig:"+eventHash, actorPublicKey)`.
4. **Hash chain** — verify `event[n].previousEventHash === event[n-1].eventHash` for all n>1, and `event[1].previousEventHash === ""`.
5. **Sequence ordering** — verify events are in contiguous ascending order starting at 1.
6. **Checkpoint hash** — recompute `checkpointHash` from checkpoint fields and compare.
7. **Batch commitment** — recompute `batchCommitment` from the event hashes and compare to `checkpoint.batchCommitment`.
8. **On-chain check** (optional, requires network) — query the Soroban contract for the stored commitment and compare.

## Verification Result

```typescript
interface VerificationResult {
  status: VerificationStatus;
  protocolVersion: number;
  organizationId: string;
  workflowId: string;
  totalEvents: number;
  verifiedEvents: EventVerificationResult[];
  checkpointResult?: CheckpointVerificationResult;
  warnings: string[];
  errors: string[];
  checkedAt: string;
  networkUsed: boolean;
  summary: string;
}

enum VerificationStatus {
  VALID = "VALID",
  INVALID_SIGNATURE = "INVALID_SIGNATURE",
  BROKEN_HASH_CHAIN = "BROKEN_HASH_CHAIN",
  CHECKPOINT_MISMATCH = "CHECKPOINT_MISMATCH",
  UNAUTHORIZED_ACTOR = "UNAUTHORIZED_ACTOR",
  INCOMPLETE_BUNDLE = "INCOMPLETE_BUNDLE",
  UNANCHORED_EVENTS = "UNANCHORED_EVENTS",
  NETWORK_UNAVAILABLE = "NETWORK_UNAVAILABLE",
  UNSUPPORTED_PROTOCOL_VERSION = "UNSUPPORTED_PROTOCOL_VERSION",
}
```

## What VALID Means

A `VALID` result means:
- All event hashes match their recomputed values.
- All event chain links are correct.
- All signatures (where public keys are provided) are valid Ed25519 signatures.
- The checkpoint commitment matches the event batch.
- If network was used: the commitment matches what is recorded on Stellar.

A `VALID` result does **NOT** mean:
- No events were omitted or withheld.
- The underlying complaint claims are true.
- The actors' real-world identities match their stated roles.
- The Stellar ledger timestamp equals the real-world time of any event.

`UNANCHORED_EVENTS` is not a failure — it means events are cryptographically valid but not yet independently confirmed on Stellar.

## Exporting a Bundle

From the web application: **Case Detail → Export bundle.json**

From the API: `GET /api/cases/:caseId/bundle`

From the SDK:
```typescript
const bundle = await exportVerificationBundle(store, caseId);
```

## Verifying a Bundle

CLI (offline):
```
resolvetrace-verify verify bundle.json
```

CLI (with on-chain check):
```
resolvetrace-verify verify bundle.json --contract-id CABC...
```

SDK:
```typescript
const result = await verifyCase(bundle);
console.log(result.status); // "VALID" | "BROKEN_HASH_CHAIN" | ...
```

Browser: drag bundle.json into the Verify page in the application.
