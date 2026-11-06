/**
 * Generates a deterministic demo Ed25519 key pair for local development.
 * Run: node scripts/generate-demo-key.mjs
 *
 * Output goes into apps/web/src/lib/demo-key.ts
 * NEVER use the generated key for production signing.
 */

import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha512";

ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));

const PRIVATE_KEY_HEX = "9a8da92a4af5f2b1e3a6c8d2f0b4e7c1a3d5f8b0e2c4a6d8f0b2e4c6a8d0f2e4";

function hexToBytes(hex) {
  const result = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    result[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return result;
}

function bytesToHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

const privateKeyBytes = hexToBytes(PRIVATE_KEY_HEX);
const publicKeyBytes = await ed.getPublicKeyAsync(privateKeyBytes);
const PUBLIC_KEY_HEX = bytesToHex(publicKeyBytes);

console.log("Demo key pair (NOT FOR PRODUCTION):");
console.log(`  Private: ${PRIVATE_KEY_HEX}`);
console.log(`  Public:  ${PUBLIC_KEY_HEX}`);
console.log("");
console.log("Update apps/web/src/lib/demo-key.ts with these values.");
