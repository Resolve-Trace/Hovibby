/// Contract tests for ResolveTrace Registry
///
/// These tests use the Soroban testutils environment which runs the contract
/// in a simulated host. Tests marked with comments about Testnet behavior
/// must be verified against the actual deployed contract.

#[cfg(test)]
use soroban_sdk::{
    testutils::{Address as _, AuthorizedFunction, AuthorizedInvocation},
    Address, Bytes, Env, String, IntoVal,
};

#[cfg(test)]
use crate::{ResolveTraceRegistry, ResolveTraceRegistryClient, Error};

#[cfg(test)]
fn make_commitment(env: &Env, val: u8) -> Bytes {
    Bytes::from_array(env, &[val; 32])
}

#[cfg(test)]
fn make_zero_commitment(env: &Env) -> Bytes {
    Bytes::from_array(env, &[0u8; 32])
}

#[cfg(test)]
fn reg_id(env: &Env, s: &str) -> String {
    String::from_str(env, s)
}

#[cfg(test)]
fn org_id(env: &Env, s: &str) -> String {
    String::from_str(env, s)
}

#[cfg(test)]
fn policy_v(env: &Env, s: &str) -> String {
    String::from_str(env, s)
}

// ─── Registry Creation ────────────────────────────────────────────────────────

#[test]
fn test_create_registry_success() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(ResolveTraceRegistry, ());
    let client = ResolveTraceRegistryClient::new(&env, &contract_id);

    let controller = Address::generate(&env);
    let rid = reg_id(&env, "test-registry-001");

    client.create_registry_auth(
        &controller,
        &rid,
        &org_id(&env, "Test Organization"),
        &policy_v(&env, "1.0.0"),
    );

    let meta = client.get_registry(&rid);
    assert!(meta.is_some());
    let m = meta.unwrap();
    assert_eq!(m.registry_id, rid);

    assert!(client.is_registry_active(&rid));
    assert_eq!(client.get_latest_sequence(&rid), 0);
}

#[test]
fn test_create_registry_duplicate_fails() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(ResolveTraceRegistry, ());
    let client = ResolveTraceRegistryClient::new(&env, &contract_id);

    let controller = Address::generate(&env);
    let rid = reg_id(&env, "dup-registry");

    client.create_registry_auth(
        &controller,
        &rid,
        &org_id(&env, "Org"),
        &policy_v(&env, "1.0.0"),
    );

    let result = client.try_create_registry_auth(
        &controller,
        &rid,
        &org_id(&env, "Org2"),
        &policy_v(&env, "1.0.0"),
    );

    assert!(result.is_err());
}

#[test]
fn test_create_registry_empty_id_fails() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(ResolveTraceRegistry, ());
    let client = ResolveTraceRegistryClient::new(&env, &contract_id);

    let controller = Address::generate(&env);

    let result = client.try_create_registry_auth(
        &controller,
        &reg_id(&env, ""),
        &org_id(&env, "Org"),
        &policy_v(&env, "1.0.0"),
    );
    assert!(result.is_err());
}

// ─── Writer Authorization ─────────────────────────────────────────────────────

#[test]
fn test_authorize_writer_success() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(ResolveTraceRegistry, ());
    let client = ResolveTraceRegistryClient::new(&env, &contract_id);

    let controller = Address::generate(&env);
    let new_writer = Address::generate(&env);
    let rid = reg_id(&env, "writer-test");

    client.create_registry_auth(
        &controller,
        &rid,
        &org_id(&env, "Org"),
        &policy_v(&env, "1.0.0"),
    );

    client.authorize_writer(&rid, &controller, &new_writer);

    assert!(client.is_authorized_writer(&rid, &new_writer));
}

#[test]
fn test_unauthorized_writer_change_fails() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(ResolveTraceRegistry, ());
    let client = ResolveTraceRegistryClient::new(&env, &contract_id);

    let controller = Address::generate(&env);
    let imposter = Address::generate(&env);
    let new_writer = Address::generate(&env);
    let rid = reg_id(&env, "writer-auth-fail");

    client.create_registry_auth(
        &controller,
        &rid,
        &org_id(&env, "Org"),
        &policy_v(&env, "1.0.0"),
    );

    let result = client.try_authorize_writer(&rid, &imposter, &new_writer);
    assert!(result.is_err());
}

#[test]
fn test_authorize_duplicate_writer_fails() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(ResolveTraceRegistry, ());
    let client = ResolveTraceRegistryClient::new(&env, &contract_id);

    let controller = Address::generate(&env);
    let writer = Address::generate(&env);
    let rid = reg_id(&env, "dup-writer");

    client.create_registry_auth(
        &controller,
        &rid,
        &org_id(&env, "Org"),
        &policy_v(&env, "1.0.0"),
    );
    client.authorize_writer(&rid, &controller, &writer);

    let result = client.try_authorize_writer(&rid, &controller, &writer);
    assert!(result.is_err());
}

// ─── Checkpoint Registration ──────────────────────────────────────────────────

#[test]
fn test_register_first_checkpoint_success() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(ResolveTraceRegistry, ());
    let client = ResolveTraceRegistryClient::new(&env, &contract_id);

    let controller = Address::generate(&env);
    let rid = reg_id(&env, "chk-test-1");

    client.create_registry_auth(
        &controller,
        &rid,
        &org_id(&env, "Org"),
        &policy_v(&env, "1.0.0"),
    );

    let commitment = make_commitment(&env, 0xAB);
    let zero = make_zero_commitment(&env);

    client.register_checkpoint(
        &rid,
        &controller,
        &1u32,
        &1u32,
        &5u32,
        &commitment,
        &zero,
        &policy_v(&env, "1.0.0"),
    );

    assert_eq!(client.get_latest_sequence(&rid), 1);
    let chk = client.get_checkpoint(&rid, &1u32);
    assert!(chk.is_some());
    let c = chk.unwrap();
    assert_eq!(c.sequence, 1);
    assert_eq!(c.batch_commitment, commitment);
}

#[test]
fn test_register_second_checkpoint_success() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(ResolveTraceRegistry, ());
    let client = ResolveTraceRegistryClient::new(&env, &contract_id);

    let controller = Address::generate(&env);
    let rid = reg_id(&env, "chk-test-2");

    client.create_registry_auth(
        &controller,
        &rid,
        &org_id(&env, "Org"),
        &policy_v(&env, "1.0.0"),
    );

    let c1 = make_commitment(&env, 0x11);
    let zero = make_zero_commitment(&env);

    client.register_checkpoint(
        &rid,
        &controller,
        &1u32,
        &1u32,
        &3u32,
        &c1,
        &zero,
        &policy_v(&env, "1.0.0"),
    );

    let c2 = make_commitment(&env, 0x22);
    client.register_checkpoint(
        &rid,
        &controller,
        &2u32,
        &4u32,
        &7u32,
        &c2,
        &c1, // previous = c1
        &policy_v(&env, "1.0.0"),
    );

    assert_eq!(client.get_latest_sequence(&rid), 2);
}

#[test]
fn test_unauthorized_checkpoint_fails() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(ResolveTraceRegistry, ());
    let client = ResolveTraceRegistryClient::new(&env, &contract_id);

    let controller = Address::generate(&env);
    let unauthorized = Address::generate(&env);
    let rid = reg_id(&env, "chk-unauth");

    client.create_registry_auth(
        &controller,
        &rid,
        &org_id(&env, "Org"),
        &policy_v(&env, "1.0.0"),
    );

    let result = client.try_register_checkpoint(
        &rid,
        &unauthorized,
        &1u32,
        &1u32,
        &1u32,
        &make_commitment(&env, 0xFF),
        &make_zero_commitment(&env),
        &policy_v(&env, "1.0.0"),
    );

    assert!(result.is_err());
}

#[test]
fn test_duplicate_checkpoint_fails() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(ResolveTraceRegistry, ());
    let client = ResolveTraceRegistryClient::new(&env, &contract_id);

    let controller = Address::generate(&env);
    let rid = reg_id(&env, "chk-dup");

    client.create_registry_auth(
        &controller,
        &rid,
        &org_id(&env, "Org"),
        &policy_v(&env, "1.0.0"),
    );

    client.register_checkpoint(
        &rid,
        &controller,
        &1u32,
        &1u32,
        &1u32,
        &make_commitment(&env, 0xAA),
        &make_zero_commitment(&env),
        &policy_v(&env, "1.0.0"),
    );

    // Try sequence 1 again — should fail on sequence check
    let result = client.try_register_checkpoint(
        &rid,
        &controller,
        &1u32,
        &1u32,
        &1u32,
        &make_commitment(&env, 0xBB),
        &make_zero_commitment(&env),
        &policy_v(&env, "1.0.0"),
    );

    assert!(result.is_err());
}

#[test]
fn test_wrong_sequence_fails() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(ResolveTraceRegistry, ());
    let client = ResolveTraceRegistryClient::new(&env, &contract_id);

    let controller = Address::generate(&env);
    let rid = reg_id(&env, "chk-wrongseq");

    client.create_registry_auth(
        &controller,
        &rid,
        &org_id(&env, "Org"),
        &policy_v(&env, "1.0.0"),
    );

    // Skip sequence 1, try sequence 2 directly
    let result = client.try_register_checkpoint(
        &rid,
        &controller,
        &2u32,
        &1u32,
        &1u32,
        &make_commitment(&env, 0xCC),
        &make_zero_commitment(&env),
        &policy_v(&env, "1.0.0"),
    );

    assert!(result.is_err());
}

#[test]
fn test_wrong_previous_commitment_fails() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(ResolveTraceRegistry, ());
    let client = ResolveTraceRegistryClient::new(&env, &contract_id);

    let controller = Address::generate(&env);
    let rid = reg_id(&env, "chk-wrongprev");

    client.create_registry_auth(
        &controller,
        &rid,
        &org_id(&env, "Org"),
        &policy_v(&env, "1.0.0"),
    );

    let c1 = make_commitment(&env, 0x11);
    client.register_checkpoint(
        &rid,
        &controller,
        &1u32,
        &1u32,
        &1u32,
        &c1,
        &make_zero_commitment(&env),
        &policy_v(&env, "1.0.0"),
    );

    // Wrong previous commitment for sequence 2
    let wrong_prev = make_commitment(&env, 0xFF);
    let result = client.try_register_checkpoint(
        &rid,
        &controller,
        &2u32,
        &2u32,
        &2u32,
        &make_commitment(&env, 0x22),
        &wrong_prev,
        &policy_v(&env, "1.0.0"),
    );

    assert!(result.is_err());
}

#[test]
fn test_invalid_commitment_length_fails() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(ResolveTraceRegistry, ());
    let client = ResolveTraceRegistryClient::new(&env, &contract_id);

    let controller = Address::generate(&env);
    let rid = reg_id(&env, "chk-badlen");

    client.create_registry_auth(
        &controller,
        &rid,
        &org_id(&env, "Org"),
        &policy_v(&env, "1.0.0"),
    );

    // 16-byte commitment instead of 32
    let short = Bytes::from_array(&env, &[0xABu8; 16]);
    let result = client.try_register_checkpoint(
        &rid,
        &controller,
        &1u32,
        &1u32,
        &1u32,
        &short,
        &make_zero_commitment(&env),
        &policy_v(&env, "1.0.0"),
    );

    assert!(result.is_err());
}

// ─── Inactive Registry ────────────────────────────────────────────────────────

#[test]
fn test_inactive_registry_rejects_checkpoint() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(ResolveTraceRegistry, ());
    let client = ResolveTraceRegistryClient::new(&env, &contract_id);

    let controller = Address::generate(&env);
    let rid = reg_id(&env, "deact-chk");

    client.create_registry_auth(
        &controller,
        &rid,
        &org_id(&env, "Org"),
        &policy_v(&env, "1.0.0"),
    );
    client.deactivate_registry(&rid, &controller);
    assert!(!client.is_registry_active(&rid));

    let result = client.try_register_checkpoint(
        &rid,
        &controller,
        &1u32,
        &1u32,
        &1u32,
        &make_commitment(&env, 0xAA),
        &make_zero_commitment(&env),
        &policy_v(&env, "1.0.0"),
    );

    assert!(result.is_err());
}

#[test]
fn test_deactivate_unauthorized_fails() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(ResolveTraceRegistry, ());
    let client = ResolveTraceRegistryClient::new(&env, &contract_id);

    let controller = Address::generate(&env);
    let imposter = Address::generate(&env);
    let rid = reg_id(&env, "deact-unauth");

    client.create_registry_auth(
        &controller,
        &rid,
        &org_id(&env, "Org"),
        &policy_v(&env, "1.0.0"),
    );

    let result = client.try_deactivate_registry(&rid, &imposter);
    assert!(result.is_err());
}

// ─── Get Latest Checkpoint ────────────────────────────────────────────────────

#[test]
fn test_get_latest_checkpoint_none_before_any() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(ResolveTraceRegistry, ());
    let client = ResolveTraceRegistryClient::new(&env, &contract_id);

    let controller = Address::generate(&env);
    let rid = reg_id(&env, "empty-chk");

    client.create_registry_auth(
        &controller,
        &rid,
        &org_id(&env, "Org"),
        &policy_v(&env, "1.0.0"),
    );

    assert!(client.get_latest_checkpoint(&rid).is_none());
}

#[test]
fn test_get_latest_checkpoint_after_registration() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(ResolveTraceRegistry, ());
    let client = ResolveTraceRegistryClient::new(&env, &contract_id);

    let controller = Address::generate(&env);
    let rid = reg_id(&env, "latest-chk");

    client.create_registry_auth(
        &controller,
        &rid,
        &org_id(&env, "Org"),
        &policy_v(&env, "1.0.0"),
    );

    let c1 = make_commitment(&env, 0x55);
    client.register_checkpoint(
        &rid,
        &controller,
        &1u32,
        &1u32,
        &10u32,
        &c1,
        &make_zero_commitment(&env),
        &policy_v(&env, "1.0.0"),
    );

    let latest = client.get_latest_checkpoint(&rid);
    assert!(latest.is_some());
    assert_eq!(latest.unwrap().sequence, 1);
}

// ─── Non-existent Registry ────────────────────────────────────────────────────

#[test]
fn test_checkpoint_on_nonexistent_registry_fails() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(ResolveTraceRegistry, ());
    let client = ResolveTraceRegistryClient::new(&env, &contract_id);

    let writer = Address::generate(&env);
    let rid = reg_id(&env, "nonexistent");

    let result = client.try_register_checkpoint(
        &rid,
        &writer,
        &1u32,
        &1u32,
        &1u32,
        &make_commitment(&env, 0x00),
        &make_zero_commitment(&env),
        &policy_v(&env, "1.0.0"),
    );

    assert!(result.is_err());
}
