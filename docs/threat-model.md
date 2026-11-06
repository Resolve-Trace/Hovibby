# ResolveTrace Threat Model

**Status:** Initial draft — not security audited.

This document enumerates threats against the ResolveTrace protocol and describes what is detected, prevented, or mitigated by the system design.

---

## Trust Boundaries

### What the system can detect or prevent

| Threat | Detection / Prevention |
|--------|----------------------|
| **Event modification** | Hash chain detects unauthorized changes. Any modified event invalidates the event hash and breaks the chain from that point forward. |
| **Signature forgery** | Ed25519 signatures require the private signing key. Without it, a forged signature will fail verification. |
| **Unauthorized checkpoint submission** | The Soroban contract enforces writer authorization. Only registered writers can submit checkpoints. |
| **Invalid sequence injection** | The contract enforces monotonically increasing checkpoint sequences. |
| **Previous checkpoint rollback** | The contract enforces that each checkpoint references the previous checkpoint commitment. |
| **Duplicate checkpoint** | The contract rejects a checkpoint with a sequence number that already exists. |
| **Commitment length manipulation** | The contract validates that commitments are exactly 32 bytes. |
| **Registry impersonation** | The contract enforces that only the controller can manage writers. |

### What the system does NOT prevent

| Threat | Limitation |
|--------|-----------|
| **Event omission** | A malicious operator can withhold events from a bundle. The hash chain only proves the presented events are linked — not that all events were included. Third parties keeping copies of checkpoints can detect rollback to an earlier point but cannot detect events that were never committed. |
| **Alternative history** | A malicious controller could create a different event history starting from any point after the last public checkpoint. Public checkpoints with independent observers make this detectable for the anchored period. |
| **Compromised signing key** | If a writer's private key is stolen, an attacker can submit arbitrary checkpoints. Key rotation and registry deactivation partially mitigate this. |
| **Fraudulent authorization evidence** | The bundle includes authorization evidence provided by the bundle creator. This evidence is not independently authenticated beyond the contract state. |
| **Social engineering** | An authorized officer could submit a fraudulent event with a valid signature. The protocol records it but cannot determine intent. |
| **Private data exposure through metadata** | Public blockchain metadata (sender address, timing, registry ID) can reveal organizational information even without payload content. |
| **RPC manipulation** | A compromised or malicious RPC endpoint could return false contract state. Use multiple independent RPCs for critical verification. |
| **Replay attacks** | An attacker could replay a valid signed event in a different context. Domain separation and workflowId mitigate this but cross-workflow replay is not fully prevented in v1. |
| **Browser compromise** | A compromised browser could steal wallet secrets or intercept signing requests. This is outside the protocol's scope. |
| **Insecure key storage** | Private keys stored insecurely (e.g., hardcoded, in `.env`) are vulnerable. Use hardware wallets or secure key management for production. |

---

## Specific Threat Analysis

### Malicious organization administrator

**Capabilities:** Full control of the application backend, storage, and event submission keys.

**What they can do:**
- Add events to the history before the next checkpoint.
- Submit checkpoints covering selective events.
- Deactivate the registry.
- Rotate writer keys.

**What they cannot do (when checkpoints are public):**
- Alter an event that has been committed in a checkpoint already observed by third parties.
- Deny that a checkpoint was submitted (it's on the immutable Stellar ledger).
- Remove a confirmed checkpoint from the Stellar ledger.

**Residual risk:** An administrator who controls all event submission keys can omit events. Third parties must independently anchor or observe checkpoints to limit this window.

### Compromised signing key

**Detection:** If a writer key is stolen and used to submit fraudulent checkpoints, this is detectable only if the commitment does not match the expected event batch.

**Mitigation:** 
- Rotate compromised keys via `remove_writer` + `authorize_writer`.
- Registry deactivation can halt further checkpoint submissions.
- V1 does not have automatic key rotation detection.

### Unauthorized event modification

**Detection:** The hash chain detects any modification to a committed event. The verifier will report `BROKEN_HASH_CHAIN` or `CHECKPOINT_MISMATCH`.

**Residual risk:** Modifications to events that have not yet been checkpointed are not immediately detectable.

### Malicious file uploads

**Mitigation:**
- Evidence files are stored at storage-adapter-specific paths with sanitized filenames.
- File content is never executed by the application.
- Content hashes are recorded; modified files are detectable.

**Residual risk:** The application does not perform antivirus scanning. Large files can exhaust storage.

### Private data exposure

**Protection:** 
- Complaint descriptions, names, and evidence are never placed on-chain.
- Only commitments (hashes) appear in contract storage.
- Event payloads contain only category metadata, not personal details.

**Residual risk:**
- Registry IDs are public and may reveal organizational structure.
- Transaction timing and frequency may reveal information.
- Unsalted hashes of predictable values (e.g., email addresses) could be reversed. The protocol uses random IDs, not hashes of personal data.

### Cross-organization access

**Protection:**
- Each case has an `organizationId` and `workflowId`.
- The filesystem adapter uses case-scoped directories.
- API endpoints validate case ownership (not yet fully implemented in v1 — requires proper authentication).

**V1 limitation:** The MVP does not implement a full authentication and authorization system for API access. Multi-organization deployments require a properly configured identity layer.

---

## Security Properties Summary

| Property | Status |
|----------|--------|
| Event integrity (hash chain) | ✅ Implemented |
| Event authenticity (signatures) | ✅ Implemented |
| On-chain commitment anchoring | ✅ Implemented (Soroban) |
| Independent verification | ✅ Implemented (CLI verifier) |
| Unauthorized checkpoint prevention | ✅ Enforced by contract |
| Sequence enforcement | ✅ Enforced by contract |
| Previous checkpoint enforcement | ✅ Enforced by contract |
| Key rotation | ⚠️ Manual process only in v1 |
| Event omission detection | ⚠️ Requires independent observers |
| Full authentication/authorization | ⚠️ Not implemented in v1 API |
| Multi-organization isolation | ⚠️ Requires additional work |
| Security audit | ❌ Not performed |
| Formal verification | ❌ Not performed |

---

## Responsible Disclosure

To report security vulnerabilities in ResolveTrace, please email security@[project-domain] or open a private GitHub Security Advisory. Do not file public issues for security vulnerabilities.

We will acknowledge receipt within 72 hours and aim to address critical vulnerabilities within 30 days.
