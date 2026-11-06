/**
 * ResolveTrace API client — browser-side.
 *
 * All fetch calls to /api/* should go through this client so that:
 *   1. The Authorization header is attached automatically.
 *   2. Error handling is consistent.
 *   3. The API key is read from a single place.
 *
 * The API key is read from NEXT_PUBLIC_API_KEY.
 * In production, set this in .env.local alongside SERVER_API_KEY.
 * Both values must match.
 *
 * SECURITY NOTE:
 *   NEXT_PUBLIC_* variables are embedded in the client bundle and visible
 *   to anyone who views the page source. The API key here protects against
 *   unauthenticated external callers, not against users of the application
 *   itself. For per-user access control, replace this with a proper session-
 *   based auth system.
 *
 * LOCAL DEVELOPMENT:
 *   If NEXT_PUBLIC_API_KEY is not set, requests are sent without auth.
 *   The server middleware allows this in development (with a warning).
 */

const API_KEY = process.env["NEXT_PUBLIC_API_KEY"] ?? "";

function buildHeaders(extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...extra,
  };
  if (API_KEY) {
    headers["Authorization"] = `Bearer ${API_KEY}`;
  }
  return headers;
}

export interface ApiError {
  status: number;
  error: string;
  details?: string | string[];
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let body: { error?: string; details?: string | string[] } = {};
    try {
      body = (await res.json()) as typeof body;
    } catch {
      // non-JSON error body
    }
    const err: ApiError = {
      status: res.status,
      error: body.error ?? `HTTP ${res.status}`,
      details: body.details,
    };
    throw err;
  }
  return res.json() as Promise<T>;
}

export const apiClient = {
  async get<T>(path: string): Promise<T> {
    const res = await fetch(path, {
      method: "GET",
      headers: buildHeaders(),
    });
    return handleResponse<T>(res);
  },

  async post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(path, {
      method: "POST",
      headers: buildHeaders(),
      body: JSON.stringify(body),
    });
    return handleResponse<T>(res);
  },

  async postForm<T>(path: string, form: FormData): Promise<T> {
    // For multipart/form-data (file uploads) don't set Content-Type —
    // the browser sets it with the correct boundary automatically.
    const headers: Record<string, string> = {};
    if (API_KEY) {
      headers["Authorization"] = `Bearer ${API_KEY}`;
    }
    const res = await fetch(path, {
      method: "POST",
      headers,
      body: form,
    });
    return handleResponse<T>(res);
  },
};
