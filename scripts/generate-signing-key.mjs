/**
 * Generate a persistent Ed25519 signing key for the ResolveTrace server.
 *
 * Run: node scripts/generate-signing-key.mjs
 *
 * Add the output to your .env.local:
 *   SERVER_SIGNING_KEY_HEX=<private key hex>
 *
 * NEVER commit the private key to source control.
 * NEVER share the private key.
 * Back it up securely — losing it means new events cannot be signed
 * with the same identity (old events remain verifiable via their public key).
 */

import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha512";

ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));

function bytesToHex(bytes) {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const privateKey = ed.utils.randomPrivateKey();
const publicKey = await ed.getPublicKeyAsync(privateKey);

const privateHex = bytesToHex(privateKey);
const publicHex = bytesToHex(publicKey);

console.log("Generated Ed25519 signing key pair\n");
console.log("Add this to your .env.local:");
console.log(`SERVER_SIGNING_KEY_HEX=${privateHex}\n`);
console.log("Corresponding public key (embedded in signed events):");
console.log(`${publicHex}\n`);
console.log("⚠️  Keep the private key secret. Never commit it to source control.");
