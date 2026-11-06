/**
 * Demo signing key for local development and the live demo.
 *
 * SECURITY: This is a throwaway key pair committed to the repository so
 * the demo works out of the box without configuration. It has no value.
 *
 * DO NOT use this key for production deployments.
 * DO NOT use it to sign events you expect to be independently verifiable.
 * Configure a proper server-side signer for production use.
 *
 * Key pair generated with scripts/generate-demo-key.mjs:
 *   Private key (seed): 9a8da92a4af5f2b1e3a6c8d2f0b4e7c1a3d5f8b0e2c4a6d8f0b2e4c6a8d0f2e4
 *   Public  key:        derived below — 32-byte Ed25519 public key corresponding to the seed
 */

// Ed25519 key pair — DEMO ONLY, NOT FOR PRODUCTION
export const DEMO_PRIVATE_KEY_HEX =
  "9a8da92a4af5f2b1e3a6c8d2f0b4e7c1a3d5f8b0e2c4a6d8f0b2e4c6a8d0f2e4";

// Public key corresponding to DEMO_PRIVATE_KEY_HEX
// Derived via: node scripts/generate-demo-key.mjs
export const DEMO_PUBLIC_KEY_HEX =
  "dc3d69be8426fa5c91c0863abbfb6fa3f8806592589f7e1a795fa6cdae4bcde0";

/**
 * Returns true when NEXT_PUBLIC_DEMO_MODE=true is set.
 * Demo mode shows sample cases and uses the demo signing key.
 * Demo data is clearly marked and never mixed with real records.
 */
export function isDemoMode(): boolean {
  return process.env["NEXT_PUBLIC_DEMO_MODE"] === "true";
}
