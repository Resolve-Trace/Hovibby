# ResolveTrace Protocol Specification v1

**Status:** Draft — not audited.

---

## 1. Overview

The ResolveTrace protocol provides cryptographically linked event histories anchored to Stellar via Soroban smart contracts.

The protocol answers two of three accountability questions:

1. **Integrity:** Has the presented record changed since it was committed? (YES — detectable via hash chain and checkpoint verification)
2. **Authenticity:** Was the event signed by an authorized actor? (YES — detectable via Ed25519 signatures and authorization evidence)
3. **Truth:** Is the event's underlying claim actually true? (NO — cryptography cannot establish this)

---

## 2. Event Format

### 2.1 Canonical Event (UnsignedEvent)

```typescript
{
  protocolVersion: 1,          // Must be 1
  eventId: string,             // UUID v4
  organizationId: string,      // Organization identifier
  workflowId: string,          // Workflow/case identifier (UUID v4)
  sequence: number,            // Starts at 1, increments by 1
  eventType: string,           // e.g. "case.created"
  actorId: string,             // Actor identifier (opaque)
  actorPublicKey?: string,     // Ed25519 public key, hex-encoded
  actorRole: string,           // e.g. "reporter", "officer"
  claimedAt: string,           // ISO 8601 UTC — claimed by submitter
  previousEventHash: string,   // "" for first event, hex SHA-256 otherwise
  payloadCommitment: string,   // hex SHA-256 of payload
  policyVersion: string,       // e.g. "1.0.0"
  checkpointRef?: string,      // Optional checkpoint reference
}
```

### 2.2 Canonical Serialization

Events are serialized using **RFC 8785 JSON Canonicalization Scheme (JCS)**:
- Object keys sorted lexicographically
- No insignificant whitespace
- Deterministic output regardless of insertion order

### 2.3 Payload Commitment

```
payloadCommitment = SHA-256("resolvetrace:v1:payload:" || JCS(payload))
```

The payload must be serialized with JCS before hashing. The payload is never stored on-chain.

### 2.4 Event Hash

```
eventHash = SHA-256("resolvetrace:v1:event:" || JCS(unsignedEvent))
```

Where `unsignedEvent` includes `payloadCommitment` but not `signature` or `eventHash`.

### 2.5 Signature

```
signatureInput = "resolvetrace:v1:sig:" || eventHash
signature = Ed25519.sign(signatureInput, privateKey)
```

Signature is hex-encoded. The signature is over the eventHash (not directly over the serialized event), which prevents reuse of signatures across domain types.

---

## 3. Hash-Linked Event Chain

```
event[1].previousEventHash = ""
event[n].previousEventHash = event[n-1].eventHash  (n > 1)
```

Validation:
- Events must be in ascending sequence order starting at 1.
- No gaps or duplicate sequence numbers.
- Each event's `previousEventHash` must match the `eventHash` of the preceding event.
- Each event's stored `eventHash` must match the recomputed hash.

**Limitation:** The hash chain detects unauthorized modifications and reordering. It does not prevent a malicious operator from withholding events or constructing an alternative history from the beginning.

---

## 4. Checkpoint Format

```typescript
{
  protocolVersion: 1,
  organizationId: string,
  registryId: string,
  checkpointSequence: number,       // Starts at 1, increments by 1
  eventSequenceStart: number,       // First event sequence in batch
  eventSequenceEnd: number,         // Last event sequence in batch
  batchCommitment: string,          // hex-encoded 32-byte commitment
  previousCheckpointCommitment: string, // "" for first, else previous checkpointHash
  policyVersion: string,
  claimedAt: string,                // ISO 8601 UTC
  checkpointHash: string,           // hex SHA-256 of all above fields
}
```

### 4.1 Batch Commitment

**Single event:**
```
batchCommitment = SHA-256("resolvetrace:v1:checkpoint:" || eventHash)
```

**Multiple events (Merkle root):**
```
leaf[i] = SHA-256("resolvetrace:v1:merkle:leaf:" || eventHash[i])
node(L, R) = SHA-256("resolvetrace:v1:merkle:node:" || L || R)
```
Events are sorted by sequence before computing the tree. If the number of leaves is odd, the last leaf is duplicated.

### 4.2 Checkpoint Hash
```
checkpointHash = SHA-256(JCS(checkpointWithoutHash))
```

---

## 5. Policy Engine

Policies define:
- Valid state transitions (from → to, required event type, allowed roles)
- Deadline rules
- Appeal rules
- Event types requiring on-chain anchoring

Policies are versioned. Historical events are validated against the policy version in effect at the time of the event.

---

## 6. Verification Bundle

```typescript
{
  bundleVersion: 1,
  exportedAt: string,
  organizationId: string,
  workflowId: string,
  events: SignedEvent[],
  checkpoint?: Checkpoint,
  authorizationEvidence: Record<publicKey, ActorRole[]>,
  policy: Policy,
}
```

The bundle is self-contained for offline verification. Network access adds on-chain commitment validation.

---

## 7. Soroban Contract

The contract stores:
- Registry metadata
- Controller and writer addresses
- Latest checkpoint sequence
- Checkpoint data (per sequence)
- Registry active flag

The contract enforces:
- Only the controller can manage writers
- Only authorized writers can submit checkpoints
- Sequences must be monotonically increasing
- Previous checkpoint commitment must match
- Commitments must be exactly 32 bytes

---

## 8. Protocol Versioning

- `protocolVersion: 1` is the current version.
- Future versions will increment this field.
- Verifiers must reject unsupported versions with `UNSUPPORTED_PROTOCOL_VERSION`.
- Backward compatibility is not guaranteed across major versions.

---

## 9. Known Limitations

1. **Event omission:** Cannot be cryptographically prevented; requires independent observers.
2. **Alternative histories:** Detectable only if independent parties have observed prior checkpoints.
3. **Key rotation:** Manual process in v1. Compromised keys require manual registry intervention.
4. **Timestamp trust:** `claimedAt` is provided by the submitting system and is not cryptographically verified. The Stellar ledger timestamp for the checkpoint transaction is independently reliable.
5. **No anonymization:** Reporter identifiers and actor IDs are stored in plaintext in off-chain storage.
6. **No encryption:** Off-chain event storage is not encrypted in v1. Use filesystem permissions or encrypted storage for sensitive deployments.
