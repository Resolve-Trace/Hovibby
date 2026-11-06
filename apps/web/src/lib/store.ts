/**
 * Singleton CaseStore instance for server-side use.
 *
 * DEPLOYMENT WARNING:
 *   The filesystem adapter stores data on the local disk of the server.
 *   This is NOT shared across multiple server instances.
 *   For a multi-instance deployment, configure STORAGE_ADAPTER=s3.
 *
 * This module MUST only be imported in server-side code (API routes,
 * Server Components, Server Actions). Never import it in client components.
 */

import { createCaseStoreFromEnv } from "@resolvetrace/storage";
import type { CaseStore } from "@resolvetrace/storage";

let _store: CaseStore | undefined;

export function getStore(): CaseStore {
  if (!_store) {
    _store = createCaseStoreFromEnv();
  }
  return _store;
}
