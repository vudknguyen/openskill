import { loadAuth, saveAuth, clearAuth, type AuthData } from "./auth.js";

interface RefreshResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  refresh_expires_in?: number;
}

/**
 * Return valid auth data, auto-refreshing the access token if expired.
 *
 * Flow:
 * 1. Load auth — return null if no auth stored
 * 2. If access token not expired — return as-is
 * 3. If access token expired + refresh token valid — refresh
 * 4. If refresh fails (401) or both expired — clear auth, return null
 */
export async function getValidAuth(): Promise<AuthData | null> {
  const auth = loadAuth();
  if (!auth) return null;

  // Access token still valid — return as-is
  if (auth.expiresAt && new Date(auth.expiresAt) > new Date()) {
    return auth;
  }

  // Access token expired — try refresh
  if (!auth.refreshToken) {
    clearAuth();
    return null;
  }

  try {
    const res = await fetch(`${auth.serverUrl}/api/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: auth.refreshToken }),
    });

    if (!res.ok) {
      // Refresh token invalid/expired — session over
      clearAuth();
      return null;
    }

    const data = (await res.json()) as RefreshResponse;

    const expiresAt = new Date(
      Date.now() + data.expires_in * 1000
    ).toISOString();

    const refreshExpiresAt = data.refresh_expires_in
      ? new Date(Date.now() + data.refresh_expires_in * 1000).toISOString()
      : auth.refreshExpiresAt;

    const updated: AuthData = {
      ...auth,
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt,
      refreshExpiresAt,
    };
    saveAuth(updated);

    return updated;
  } catch {
    // Network error — don't clear auth, let caller handle
    return null;
  }
}
