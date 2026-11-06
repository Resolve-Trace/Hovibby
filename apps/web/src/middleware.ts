/**
 * ResolveTrace API Authentication Middleware
 *
 * Protects all /api/* routes with a shared secret token.
 *
 * Configure SERVER_API_KEY in your .env.local file.
 * Any request to /api/* without a matching token receives 401.
 *
 * Two accepted header formats:
 *   Authorization: Bearer <token>
 *   X-API-Key: <token>
 *
 * Read-only routes (GET) are also protected — case contents are confidential.
 *
 * LOCAL DEVELOPMENT:
 *   If SERVER_API_KEY is not set, the middleware allows all requests and
 *   logs a warning to the console. This lets `npm run dev` work out of the
 *   box without configuration, while making it impossible to accidentally
 *   deploy an unprotected instance (the warning is hard to miss).
 *
 * PRODUCTION:
 *   SERVER_API_KEY MUST be set. Use a cryptographically random value with
 *   at least 32 bytes of entropy, e.g.:
 *     node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 *
 * IMPORTANT LIMITATION:
 *   A shared API key is a single factor. It proves that the caller knows
 *   the key; it does not prove which user made a request. For multi-user
 *   deployments, replace this with a proper per-user auth system (Clerk,
 *   Auth.js, etc.) and record the authenticated user ID as the actorId in
 *   every event.
 */

import { NextRequest, NextResponse } from "next/server";

export const config = {
  matcher: "/api/:path*",
};

const UNPROTECTED_DEV_WARNING = `
⚠️  ResolveTrace: SERVER_API_KEY is not set.
   All API routes are UNPROTECTED in this process.
   Set SERVER_API_KEY in .env.local before deploying.
   Example: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
`;

let _warnedOnce = false;

export function middleware(request: NextRequest): NextResponse {
  const configuredKey = process.env["SERVER_API_KEY"];

  // If no key is configured, allow all requests in development but warn loudly.
  // In production (NODE_ENV=production) we fail closed regardless.
  if (!configuredKey) {
    if (process.env["NODE_ENV"] === "production") {
      return NextResponse.json(
        {
          error: "Server misconfiguration: API authentication is not configured.",
          hint: "Set SERVER_API_KEY in your environment before running in production.",
        },
        { status: 503 }
      );
    }

    // Development: allow but warn
    if (!_warnedOnce) {
      console.warn(UNPROTECTED_DEV_WARNING);
      _warnedOnce = true;
    }
    return NextResponse.next();
  }

  // Extract the token from Authorization header or X-API-Key header
  const authHeader = request.headers.get("authorization");
  const apiKeyHeader = request.headers.get("x-api-key");

  let providedKey: string | null = null;

  if (authHeader) {
    const parts = authHeader.split(" ");
    if (parts[0]?.toLowerCase() === "bearer" && parts[1]) {
      providedKey = parts[1];
    }
  } else if (apiKeyHeader) {
    providedKey = apiKeyHeader;
  }

  if (!providedKey) {
    return NextResponse.json(
      {
        error: "Authentication required.",
        hint: "Provide your API key via 'Authorization: Bearer <key>' or 'X-API-Key: <key>'.",
      },
      { status: 401 }
    );
  }

  // Constant-time comparison to prevent timing attacks
  const provided = Buffer.from(providedKey, "utf-8");
  const expected = Buffer.from(configuredKey, "utf-8");

  // Lengths must match first (timingSafeEqual requires same length)
  if (provided.length !== expected.length) {
    return NextResponse.json({ error: "Invalid API key." }, { status: 401 });
  }

  try {
    const { timingSafeEqual } = require("crypto") as typeof import("crypto");
    if (!timingSafeEqual(provided, expected)) {
      return NextResponse.json({ error: "Invalid API key." }, { status: 401 });
    }
  } catch {
    // Fallback for environments where crypto is restricted
    if (providedKey !== configuredKey) {
      return NextResponse.json({ error: "Invalid API key." }, { status: 401 });
    }
  }

  return NextResponse.next();
}
