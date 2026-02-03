import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock auth module
vi.mock("../core/auth.js", () => ({
  loadAuth: vi.fn(),
  saveAuth: vi.fn(),
  clearAuth: vi.fn(),
}));

import { loadAuth, saveAuth, clearAuth } from "../core/auth.js";
import { getValidAuth } from "../core/token-refresh.js";

const mockLoadAuth = vi.mocked(loadAuth);
const mockSaveAuth = vi.mocked(saveAuth);
const mockClearAuth = vi.mocked(clearAuth);

function makeAuth(overrides: Record<string, unknown> = {}) {
  return {
    accessToken: "access-token",
    refreshToken: "refresh-token",
    serverUrl: "https://example.com",
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1h from now
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.restoreAllMocks();
});

describe("getValidAuth", () => {
  it("returns null when no stored auth", async () => {
    mockLoadAuth.mockReturnValue(null);
    const result = await getValidAuth();
    expect(result).toBeNull();
  });

  it("returns auth as-is when access token is not expired", async () => {
    const auth = makeAuth();
    mockLoadAuth.mockReturnValue(auth as ReturnType<typeof loadAuth>);
    const result = await getValidAuth();
    expect(result).toEqual(auth);
    expect(mockSaveAuth).not.toHaveBeenCalled();
  });

  it("clears and returns null when expired with no refresh token", async () => {
    const auth = makeAuth({
      expiresAt: new Date(Date.now() - 1000).toISOString(),
      refreshToken: undefined,
    });
    mockLoadAuth.mockReturnValue(auth as ReturnType<typeof loadAuth>);
    const result = await getValidAuth();
    expect(result).toBeNull();
    expect(mockClearAuth).toHaveBeenCalled();
  });

  it("refreshes and saves updated auth when expired + refresh succeeds", async () => {
    const auth = makeAuth({
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    });
    mockLoadAuth.mockReturnValue(auth as ReturnType<typeof loadAuth>);

    const refreshResponse = {
      access_token: "new-access-token",
      refresh_token: "new-refresh-token",
      token_type: "bearer",
      expires_in: 900,
    };

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(refreshResponse),
      })
    );

    const result = await getValidAuth();
    expect(result).not.toBeNull();
    expect(result!.accessToken).toBe("new-access-token");
    expect(result!.refreshToken).toBe("new-refresh-token");
    expect(mockSaveAuth).toHaveBeenCalledOnce();
    expect(mockClearAuth).not.toHaveBeenCalled();
  });

  it("clears and returns null when refresh returns 401", async () => {
    const auth = makeAuth({
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    });
    mockLoadAuth.mockReturnValue(auth as ReturnType<typeof loadAuth>);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
      })
    );

    const result = await getValidAuth();
    expect(result).toBeNull();
    expect(mockClearAuth).toHaveBeenCalled();
  });

  it("returns null but does NOT clear auth on network error", async () => {
    const auth = makeAuth({
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    });
    mockLoadAuth.mockReturnValue(auth as ReturnType<typeof loadAuth>);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("Network failure"))
    );

    const result = await getValidAuth();
    expect(result).toBeNull();
    expect(mockClearAuth).not.toHaveBeenCalled();
  });
});
