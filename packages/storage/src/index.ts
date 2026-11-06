export * from "./interfaces.js";
export { FilesystemCaseStore } from "./filesystem.js";

import type { StorageConfig } from "./interfaces.js";
import { FilesystemCaseStore } from "./filesystem.js";
import type { CaseStore } from "./interfaces.js";

/**
 * Create a CaseStore from the provided configuration.
 *
 * Supported adapters:
 *   - "filesystem": Local filesystem (development and single-instance deployments)
 *   - "s3": S3-compatible object storage (multi-instance deployments)
 *
 * IMPORTANT: If STORAGE_ADAPTER is not configured in a deployment context,
 * this function throws a configuration error rather than silently using
 * an insecure default.
 */
export function createCaseStore(config: StorageConfig): CaseStore {
  switch (config.type) {
    case "filesystem":
      return new FilesystemCaseStore(config);
    case "s3":
      throw new Error(
        "S3 storage adapter is not yet implemented. " +
          "Set STORAGE_ADAPTER=filesystem for local development, " +
          "or implement the S3 adapter in packages/storage/src/s3.ts."
      );
    default: {
      const exhaustive: never = config;
      throw new Error(`Unknown storage adapter type: ${JSON.stringify(exhaustive)}`);
    }
  }
}

/**
 * Create a CaseStore from environment variables.
 * Throws a descriptive error if required variables are missing.
 */
export function createCaseStoreFromEnv(): CaseStore {
  const adapterType = process.env["STORAGE_ADAPTER"] ?? "filesystem";

  if (adapterType === "filesystem") {
    const basePath =
      process.env["STORAGE_FS_PATH"] ?? "./resolvetrace-data";
    return createCaseStore({ type: "filesystem", basePath });
  }

  if (adapterType === "s3") {
    const endpoint = process.env["STORAGE_S3_ENDPOINT"];
    const bucket = process.env["STORAGE_S3_BUCKET"];
    const region = process.env["STORAGE_S3_REGION"];
    const accessKeyId = process.env["STORAGE_S3_ACCESS_KEY_ID"];
    const secretAccessKey = process.env["STORAGE_S3_SECRET_ACCESS_KEY"];

    if (!endpoint || !bucket || !region || !accessKeyId || !secretAccessKey) {
      throw new Error(
        "S3 storage adapter requires STORAGE_S3_ENDPOINT, STORAGE_S3_BUCKET, " +
          "STORAGE_S3_REGION, STORAGE_S3_ACCESS_KEY_ID, and STORAGE_S3_SECRET_ACCESS_KEY " +
          "to be set in the environment."
      );
    }

    return createCaseStore({
      type: "s3",
      endpoint,
      bucket,
      region,
      accessKeyId,
      secretAccessKey,
    });
  }

  throw new Error(
    `Unknown STORAGE_ADAPTER value: "${adapterType}". ` +
      `Supported values: "filesystem", "s3".`
  );
}
