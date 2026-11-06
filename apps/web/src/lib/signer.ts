/**
 * Server-side signing key management.
 *
 * Events signed with a stable, persistent key are permanently verifiable —
 * the public key embedded in the event remains valid indefinitely, and any
 * third party can verify the signature without contacting this server.
 *
 * Events signed with an ephemeral (per-request) key are NOT permanently
 * verifiable: the private key is discarded immediately, so no one can
 * re-verify the signature later.
 *
 * CONFIGURATION:
 *   Set SERVER_SIGNING_KEY_HEX in your .env.local file.
 *   Generate a key with:
 *     node scripts/generate-signing-key.mjs
 *
 * SECURITY RULES:
 *   1. The private key must never be logged, returned in API responses,
 *      stored in the database, or sent to the browser.
 *   2. Use a different key for every deployment environment (dev/staging/prod).
 *   3. Back up the key securely. Losing it means events signed with it
 *      can no longer be verified (the public key stays valid, but without
 *      the private key you cannot issue new events on the same identity).
 *   4. Key rotation: generate a new key, authorize it in the Soroban
 *      registry contract, and update SERVER_SIGNING_KEY_HEX. Old events
 *      retain their original public key and remain verifiable.
 *
 * FALLBACK BEHAVIOUR:
 *   If SERVER_SIGNING_KEY_HEX is not set, a fresh ephemeral key is generated
 *   per request with a loud warning. This keeps local development working
 *   without configuration but makes it obvious when the key is missing.
 *
 * This module is SERVER-ONLY. Never import it in client components.
 */

import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha512";
import { toHex, fromHex } from "@resolvetrace/protocol";

ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));

export interface SigningKey {
  privateKeyHex: string;
  publicKeyHex: string;
  /** true = loaded from SERVER_SIGNING_KEY_HEX; false = ephemeral fallback */
  isPersistent: boolean;
}

let _signingKey: SigningKey | undefined;

/**
 * Returns the server signing key.
 *
 * Reads SERVER_SIGNING_KEY_HEX from the environment on first call and
 * caches the result. Validates the key is a valid 32-byte Ed25519 seed.
 *
 * Throws if the key is configured but malformed.
 * Falls back to an ephemeral key if not configured (with a warning).
 */
export async function getSigningKey(): Promise<SigningKey> {
  if (_signingKey) return _signingKey;

  const envKey = process.env["SERVER_SIGNING_KEY_HEX"];

  if (envKey) {
    // Validate: must be a 64-character hex string (32 bytes)
    if (!/^[0-9a-fA-F]{64}$/.test(envKey)) {
      throw new Error(
        "SERVER_SIGNING_KEY_HEX is set but invalid. " +
          "It must be exactly 64 hex characters (a 32-byte Ed25519 private key seed). " +
          "Generate one with: node scripts/generate-signing-key.mjs"
      );
    }

    const privateKeyBytes = fromHex(envKey);
    const publicKeyBytes = await ed.getPublicKeyAsync(privateKeyBytes);

    _signingKey = {
      privateKeyHex: envKey,
      publicKeyHex: toHex(publicKeyBytes),
      isPersistent: true,
    };

    return _signingKey;
  }

  // Not configured — ephemeral fallback with warning
  if (process.env["NODE_ENV"] === "production") {
    throw new Error(
      "SERVER_SIGNING_KEY_HEX is not set. " +
        "A persistent signing key is required in production. " +
        "Generate one with: node scripts/generate-signing-key.mjs"
    );
  }

  console.warn(`
⚠️  ResolveTrace: SERVER_SIGNING_KEY_HEX is not set.
   Events will be signed with a throwaway key generated per request.
   Signatures on these events CANNOT be verified after the request ends.
   Set SERVER_SIGNING_KEY_HEX in .env.local for persistent, verifiable events.
   Generate a key: node scripts/generate-signing-key.mjs
`);

  // Generate a fresh ephemeral key for this server process
  // (at least consistent within a single process lifetime)
  const privateKeyBytes = ed.utils.randomPrivateKey();
  const publicKeyBytes = await ed.getPublicKeyAsync(privateKeyBytes);

  _signingKey = {
    privateKeyHex: toHex(privateKeyBytes),
    publicKeyHex: toHex(publicKeyBytes),
    isPersistent: false,
  };

  return _signingKey;
}

/**
 * Sign data with the server signing key.
 * Use this instead of calling signEvent directly from API routes.
 */
export { signEvent } from "@resolvetrace/protocol";
