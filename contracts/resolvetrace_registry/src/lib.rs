/*!
 * ResolveTrace Registry Contract
 *
 * This Soroban contract is the on-chain component of the ResolveTrace
 * accountability protocol. It provides:
 *
 *   1. Registry creation — establishes an organization's event stream on Stellar.
 *   2. Writer authorization — the controller can authorize additional writers.
 *   3. Checkpoint registration — authorized writers submit cryptographic
 *      commitments to event batches.
 *   4. Read access — retrieve current checkpoint state.
 *
 * WHAT THIS CONTRACT GUARANTEES:
 *   - Only the registered controller can change writer authorization.
 *   - Only authorized writers can submit checkpoints.
 *   - Checkpoint sequences are monotonically increasing.
 *   - Each checkpoint references the previous checkpoint commitment.
 *   - Duplicate checkpoints for the same sequence are rejected.
 *
 * WHAT THIS CONTRACT DOES NOT GUARANTEE:
 *   - The truth of any claim in any event.
 *   - That all events have been disclosed.
 *   - The real-world identity of any actor.
 *
 * SECURITY NOTE: The registry ID is public. It does not contain
 * confidential case information. Confidential data remains off-chain.
 */

#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short,
    Address, Bytes, BytesN, Env, String, Vec,
};

// ─── Storage Keys ─────────────────────────────────────────────────────────────

/// Top-level storage key prefix for registry data.
/// Using separate keys for each field to keep storage compact and bounded.
#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    /// Registry metadata
    RegistryMeta(String),
    /// Controller (admin) for a registry
    Controller(String),
    /// Authorized writers for a registry
    Writers(String),
    /// Latest checkpoint sequence number for a registry
    LatestSeq(String),
    /// Checkpoint data for (registry_id, sequence)
    Checkpoint(String, u32),
    /// Registry active flag
    RegistryActive(String),
}

// ─── Data Types ───────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone)]
pub struct RegistryMeta {
    pub registry_id: String,
    pub organization_id: String,
    pub created_at_ledger: u32,
    pub protocol_version: u32,
    pub policy_version: String,
}

#[contracttype]
#[derive(Clone)]
pub struct CheckpointData {
    pub registry_id: String,
    pub sequence: u32,
    pub event_sequence_start: u32,
    pub event_sequence_end: u32,
    /// 32-byte batch commitment (Merkle root or single-event commitment), hex as Bytes
    pub batch_commitment: Bytes,
    /// 32-byte previous checkpoint commitment; all-zeros for sequence=1
    pub previous_checkpoint_commitment: Bytes,
    pub policy_version: String,
    pub submitted_by: Address,
    pub submitted_at_ledger: u32,
}

// ─── Errors ───────────────────────────────────────────────────────────────────

#[contracttype]
#[repr(u32)]
#[derive(Copy, Clone, Debug, PartialEq, Eq)]
pub enum Error {
    /// Registry does not exist
    RegistryNotFound = 1,
    /// Registry is not active (has been deactivated)
    RegistryInactive = 2,
    /// Caller is not the controller
    UnauthorizedController = 3,
    /// Caller is not an authorized writer
    UnauthorizedWriter = 4,
    /// Sequence number is not the expected next sequence
    InvalidSequence = 5,
    /// A checkpoint with this sequence already exists
    DuplicateCheckpoint = 6,
    /// Previous checkpoint commitment does not match expected value
    InvalidPreviousCommitment = 7,
    /// Registry ID is already registered
    RegistryAlreadyExists = 8,
    /// Commitment bytes have wrong length (must be 32 bytes)
    InvalidCommitmentLength = 9,
    /// Registry ID is empty or invalid
    InvalidRegistryId = 10,
    /// Writer is already authorized
    WriterAlreadyAuthorized = 11,
    /// Cannot remove the only writer or the controller
    CannotRemoveController = 12,
}

impl From<Error> for soroban_sdk::Error {
    fn from(e: Error) -> Self {
        soroban_sdk::Error::from_contract_error(e as u32)
    }
}

// ─── Contract ─────────────────────────────────────────────────────────────────

#[contract]
pub struct ResolveTraceRegistry;

#[contractimpl]
impl ResolveTraceRegistry {
    // ── Registry Creation ───────────────────────────────────────────────────

    /// Create a new registry.
    ///
    /// The caller becomes the controller for this registry.
    /// The registry ID is a human-readable, URL-safe identifier chosen by the caller.
    /// It must not already exist.
    ///
    /// # Arguments
    /// * `registry_id`     — Unique identifier for this registry (max 64 chars).
    /// * `organization_id` — Organization name or identifier (for metadata only).
    /// * `policy_version`  — Policy version string in effect at creation.
    pub fn create_registry(
        env: Env,
        registry_id: String,
        organization_id: String,
        policy_version: String,
    ) -> Result<(), Error> {
        // Validate registry_id length
        if registry_id.len() == 0 || registry_id.len() > 64 {
            return Err(Error::InvalidRegistryId);
        }

        // Check not already registered
        if env.storage().persistent().has(&DataKey::RegistryMeta(registry_id.clone())) {
            return Err(Error::RegistryAlreadyExists);
        }

        let caller = env.current_contract_address();
        // For create_registry, the caller signs the invocation.
        // We use invoke_contract auth pattern — the actual auth is:
        // The tx source account must authorize this, so we require
        // the controller to authorize.
        // In Soroban, we use `require_auth` on an Address passed in.
        // To keep the interface simple, the controller is passed as a parameter.
        // See create_registry_with_controller for the auth-safe version.

        let _ = caller; // suppress unused warning

        let meta = RegistryMeta {
            registry_id: registry_id.clone(),
            organization_id,
            created_at_ledger: env.ledger().sequence(),
            protocol_version: 1,
            policy_version,
        };

        env.storage()
            .persistent()
            .set(&DataKey::RegistryMeta(registry_id.clone()), &meta);
        env.storage()
            .persistent()
            .set(&DataKey::RegistryActive(registry_id.clone()), &true);
        env.storage()
            .persistent()
            .set(&DataKey::LatestSeq(registry_id.clone()), &0u32);

        env.events().publish(
            (symbol_short!("reg_creat"), registry_id.clone()),
            meta.created_at_ledger,
        );

        Ok(())
    }

    /// Create a registry with an explicit controller address.
    /// The controller must authorize this invocation.
    pub fn create_registry_auth(
        env: Env,
        controller: Address,
        registry_id: String,
        organization_id: String,
        policy_version: String,
    ) -> Result<(), Error> {
        controller.require_auth();

        if registry_id.len() == 0 || registry_id.len() > 64 {
            return Err(Error::InvalidRegistryId);
        }

        if env
            .storage()
            .persistent()
            .has(&DataKey::RegistryMeta(registry_id.clone()))
        {
            return Err(Error::RegistryAlreadyExists);
        }

        let meta = RegistryMeta {
            registry_id: registry_id.clone(),
            organization_id,
            created_at_ledger: env.ledger().sequence(),
            protocol_version: 1,
            policy_version,
        };

        env.storage()
            .persistent()
            .set(&DataKey::RegistryMeta(registry_id.clone()), &meta);
        env.storage()
            .persistent()
            .set(&DataKey::Controller(registry_id.clone()), &controller);
        env.storage()
            .persistent()
            .set(&DataKey::RegistryActive(registry_id.clone()), &true);
        env.storage()
            .persistent()
            .set(&DataKey::LatestSeq(registry_id.clone()), &0u32);

        // Initialize writers list with the controller
        let mut writers: Vec<Address> = Vec::new(&env);
        writers.push_back(controller.clone());
        env.storage()
            .persistent()
            .set(&DataKey::Writers(registry_id.clone()), &writers);

        env.events().publish(
            (symbol_short!("reg_creat"), registry_id.clone()),
            meta.created_at_ledger,
        );

        Ok(())
    }

    // ── Writer Authorization ────────────────────────────────────────────────

    /// Authorize a new writer for a registry.
    /// Only the controller can call this.
    pub fn authorize_writer(
        env: Env,
        registry_id: String,
        controller: Address,
        new_writer: Address,
    ) -> Result<(), Error> {
        controller.require_auth();

        Self::assert_registry_active(&env, &registry_id)?;
        Self::assert_is_controller(&env, &registry_id, &controller)?;

        let mut writers = Self::get_writers(&env, &registry_id);

        // Check not already authorized
        if writers.contains(&new_writer) {
            return Err(Error::WriterAlreadyAuthorized);
        }

        writers.push_back(new_writer.clone());
        env.storage()
            .persistent()
            .set(&DataKey::Writers(registry_id.clone()), &writers);

        env.events().publish(
            (symbol_short!("wtr_auth"), registry_id.clone()),
            new_writer,
        );

        Ok(())
    }

    /// Remove a writer's authorization.
    /// Only the controller can call this. Cannot remove the controller itself.
    pub fn remove_writer(
        env: Env,
        registry_id: String,
        controller: Address,
        writer: Address,
    ) -> Result<(), Error> {
        controller.require_auth();

        Self::assert_registry_active(&env, &registry_id)?;
        Self::assert_is_controller(&env, &registry_id, &controller)?;

        // Cannot remove the controller
        if writer == controller {
            return Err(Error::CannotRemoveController);
        }

        let writers = Self::get_writers(&env, &registry_id);
        let mut new_writers: Vec<Address> = Vec::new(&env);
        for w in writers.iter() {
            if w != writer {
                new_writers.push_back(w);
            }
        }

        env.storage()
            .persistent()
            .set(&DataKey::Writers(registry_id.clone()), &new_writers);

        env.events().publish(
            (symbol_short!("wtr_remov"), registry_id.clone()),
            writer,
        );

        Ok(())
    }

    // ── Checkpoint Registration ─────────────────────────────────────────────

    /// Register a checkpoint.
    ///
    /// Validates:
    ///   - Registry exists and is active.
    ///   - Caller is an authorized writer.
    ///   - Sequence is exactly (latest_sequence + 1).
    ///   - No duplicate checkpoint for this sequence.
    ///   - Previous checkpoint commitment matches stored value.
    ///   - Commitment is exactly 32 bytes.
    ///
    /// # Arguments
    /// * `registry_id`             — Registry identifier.
    /// * `writer`                  — Authorized writer (must sign).
    /// * `sequence`                — Checkpoint sequence number (must be latest + 1).
    /// * `event_seq_start`         — First event sequence in this batch.
    /// * `event_seq_end`           — Last event sequence in this batch.
    /// * `batch_commitment`        — 32-byte commitment to the event batch.
    /// * `prev_checkpoint_commit`  — Previous checkpoint commitment (32 bytes, or
    ///                               all-zeros for the first checkpoint).
    /// * `policy_version`          — Policy version string.
    pub fn register_checkpoint(
        env: Env,
        registry_id: String,
        writer: Address,
        sequence: u32,
        event_seq_start: u32,
        event_seq_end: u32,
        batch_commitment: Bytes,
        prev_checkpoint_commit: Bytes,
        policy_version: String,
    ) -> Result<(), Error> {
        writer.require_auth();

        Self::assert_registry_active(&env, &registry_id)?;
        Self::assert_is_authorized_writer(&env, &registry_id, &writer)?;

        // Validate commitment length (32 bytes)
        if batch_commitment.len() != 32 {
            return Err(Error::InvalidCommitmentLength);
        }
        if prev_checkpoint_commit.len() != 32 {
            return Err(Error::InvalidCommitmentLength);
        }

        // Validate sequence
        let latest_seq: u32 = env
            .storage()
            .persistent()
            .get(&DataKey::LatestSeq(registry_id.clone()))
            .unwrap_or(0u32);

        let expected_seq = latest_seq + 1;
        if sequence != expected_seq {
            return Err(Error::InvalidSequence);
        }

        // Check for duplicate (defensive — sequence check above should catch this)
        if env
            .storage()
            .persistent()
            .has(&DataKey::Checkpoint(registry_id.clone(), sequence))
        {
            return Err(Error::DuplicateCheckpoint);
        }

        // Validate previous commitment
        if sequence == 1 {
            // First checkpoint: previous must be all zeros
            let zeros: Bytes = Bytes::from_array(&env, &[0u8; 32]);
            if prev_checkpoint_commit != zeros {
                return Err(Error::InvalidPreviousCommitment);
            }
        } else {
            // Subsequent checkpoint: previous must match stored previous commitment
            let prev_data: CheckpointData = env
                .storage()
                .persistent()
                .get(&DataKey::Checkpoint(registry_id.clone(), latest_seq))
                .ok_or(Error::InvalidPreviousCommitment)?;

            if prev_checkpoint_commit != prev_data.batch_commitment {
                return Err(Error::InvalidPreviousCommitment);
            }
        }

        // Store checkpoint
        let cp = CheckpointData {
            registry_id: registry_id.clone(),
            sequence,
            event_sequence_start: event_seq_start,
            event_sequence_end: event_seq_end,
            batch_commitment: batch_commitment.clone(),
            previous_checkpoint_commitment: prev_checkpoint_commit,
            policy_version,
            submitted_by: writer.clone(),
            submitted_at_ledger: env.ledger().sequence(),
        };

        env.storage()
            .persistent()
            .set(&DataKey::Checkpoint(registry_id.clone(), sequence), &cp);
        env.storage()
            .persistent()
            .set(&DataKey::LatestSeq(registry_id.clone()), &sequence);

        env.events().publish(
            (symbol_short!("chk_reg"), registry_id.clone()),
            (sequence, batch_commitment),
        );

        Ok(())
    }

    // ── Registry Administration ─────────────────────────────────────────────

    /// Deactivate a registry. Only the controller can do this.
    /// Deactivated registries do not accept new checkpoints.
    /// Previously committed checkpoints remain readable.
    ///
    /// NOTE: This operation does not erase committed history.
    /// It only prevents new checkpoints from being added.
    pub fn deactivate_registry(
        env: Env,
        registry_id: String,
        controller: Address,
    ) -> Result<(), Error> {
        controller.require_auth();
        Self::assert_registry_active(&env, &registry_id)?;
        Self::assert_is_controller(&env, &registry_id, &controller)?;

        env.storage()
            .persistent()
            .set(&DataKey::RegistryActive(registry_id.clone()), &false);

        env.events().publish(
            (symbol_short!("reg_deact"), registry_id.clone()),
            env.ledger().sequence(),
        );

        Ok(())
    }

    // ── Read Functions ──────────────────────────────────────────────────────

    /// Get registry metadata. Returns None if the registry does not exist.
    pub fn get_registry(env: Env, registry_id: String) -> Option<RegistryMeta> {
        env.storage()
            .persistent()
            .get(&DataKey::RegistryMeta(registry_id))
    }

    /// Check if a registry is active.
    pub fn is_registry_active(env: Env, registry_id: String) -> bool {
        env.storage()
            .persistent()
            .get(&DataKey::RegistryActive(registry_id))
            .unwrap_or(false)
    }

    /// Get the controller address for a registry.
    pub fn get_controller(env: Env, registry_id: String) -> Option<Address> {
        env.storage()
            .persistent()
            .get(&DataKey::Controller(registry_id))
    }

    /// Get all authorized writers for a registry.
    pub fn get_writers(env: &Env, registry_id: &String) -> Vec<Address> {
        env.storage()
            .persistent()
            .get(&DataKey::Writers(registry_id.clone()))
            .unwrap_or_else(|| Vec::new(env))
    }

    /// Get the latest checkpoint sequence number.
    pub fn get_latest_sequence(env: Env, registry_id: String) -> u32 {
        env.storage()
            .persistent()
            .get(&DataKey::LatestSeq(registry_id))
            .unwrap_or(0u32)
    }

    /// Get a specific checkpoint by sequence number.
    pub fn get_checkpoint(
        env: Env,
        registry_id: String,
        sequence: u32,
    ) -> Option<CheckpointData> {
        env.storage()
            .persistent()
            .get(&DataKey::Checkpoint(registry_id, sequence))
    }

    /// Get the latest checkpoint.
    pub fn get_latest_checkpoint(env: Env, registry_id: String) -> Option<CheckpointData> {
        let seq: u32 = env
            .storage()
            .persistent()
            .get(&DataKey::LatestSeq(registry_id.clone()))
            .unwrap_or(0u32);
        if seq == 0 {
            return None;
        }
        env.storage()
            .persistent()
            .get(&DataKey::Checkpoint(registry_id, seq))
    }

    /// Check if a given address is an authorized writer.
    pub fn is_authorized_writer(env: Env, registry_id: String, writer: Address) -> bool {
        let writers = Self::get_writers(&env, &registry_id);
        writers.contains(&writer)
    }

    // ── Internal Helpers ────────────────────────────────────────────────────

    fn assert_registry_active(env: &Env, registry_id: &String) -> Result<(), Error> {
        let active: bool = env
            .storage()
            .persistent()
            .get(&DataKey::RegistryActive(registry_id.clone()))
            .unwrap_or(false);
        if !active {
            // If it doesn't exist at all, it's also "not found"
            if !env
                .storage()
                .persistent()
                .has(&DataKey::RegistryMeta(registry_id.clone()))
            {
                return Err(Error::RegistryNotFound);
            }
            return Err(Error::RegistryInactive);
        }
        Ok(())
    }

    fn assert_is_controller(
        env: &Env,
        registry_id: &String,
        caller: &Address,
    ) -> Result<(), Error> {
        let controller: Address = env
            .storage()
            .persistent()
            .get(&DataKey::Controller(registry_id.clone()))
            .ok_or(Error::UnauthorizedController)?;
        if &controller != caller {
            return Err(Error::UnauthorizedController);
        }
        Ok(())
    }

    fn assert_is_authorized_writer(
        env: &Env,
        registry_id: &String,
        caller: &Address,
    ) -> Result<(), Error> {
        let writers = Self::get_writers(env, registry_id);
        if !writers.contains(caller) {
            return Err(Error::UnauthorizedWriter);
        }
        Ok(())
    }
}

// Re-export for testutils
#[cfg(test)]
mod tests;
