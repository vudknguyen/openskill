import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock auth module
vi.mock("../core/auth.js", () => ({
  loadAuth: vi.fn(),
  saveAuth: vi.fn(),
  clearAuth: vi.fn(),
}));

// Mock url utilities
vi.mock("../utils/url.js", () => ({
  validateServerUrl: vi.fn((url: string) => url),
}));

// Mock marketplace client
const mockRefreshToken = vi.fn();

vi.mock("../core/marketplace-client.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../core/marketplace-client.js")>();
  return {
    ...actual,
    MarketplaceClient: vi.fn().mockImplementation(() => ({
      refreshToken: mockRefreshToken,
    })),
  };
});

import { loadAuth, saveAuth, clearAuth } from "../core/auth.js";
import { MarketplaceApiError } from "../core/marketplace-client.js";
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
  vi.clearAllMocks();
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
    expect(mockRefreshToken).not.toHaveBeenCalled();
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

    mockRefreshToken.mockResolvedValue({
      access_token: "new-access-token",
      refresh_token: "new-refresh-token",
      token_type: "bearer",
      expires_in: 900,
    });

    const result = await getValidAuth();
    expect(result).not.toBeNull();
    expect(result!.accessToken).toBe("new-access-token");
    expect(result!.refreshToken).toBe("new-refresh-token");
    expect(mockSaveAuth).toHaveBeenCalledOnce();
    expect(mockClearAuth).not.toHaveBeenCalled();
  });

  it("clears and returns null when refresh returns HTTP error", async () => {
    const auth = makeAuth({
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    });
    mockLoadAuth.mockReturnValue(auth as ReturnType<typeof loadAuth>);

    mockRefreshToken.mockRejectedValue(
      new MarketplaceApiError("Refresh failed (401)", 401),
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

    mockRefreshToken.mockRejectedValue(new Error("Network failure"));

    const result = await getValidAuth();
    expect(result).toBeNull();
    expect(mockClearAuth).not.toHaveBeenCalled();
  });

  it("preserves refresh_expires_in when provided by server", async () => {
    const auth = makeAuth({
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    });
    mockLoadAuth.mockReturnValue(auth as ReturnType<typeof loadAuth>);

    mockRefreshToken.mockResolvedValue({
      access_token: "new-at",
      refresh_token: "new-rt",
      token_type: "bearer",
      expires_in: 900,
      refresh_expires_in: 7776000, // 90 days
    });

    await getValidAuth();

    const savedAuth = mockSaveAuth.mock.calls[0][0];
    expect(savedAuth.refreshExpiresAt).toBeDefined();
    // Should be ~90 days from now, not the original value
    const refreshExpiry = new Date(savedAuth.refreshExpiresAt!).getTime();
    expect(refreshExpiry).toBeGreaterThan(Date.now() + 7775000 * 1000);
  });
});
