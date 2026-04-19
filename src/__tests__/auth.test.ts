import { describe, it, expect, vi, beforeEach } from "vitest";
import { join } from "path";

// Mock the config module
vi.mock("../core/config.js", () => ({
  getConfigDir: () => "/mock/config",
  ensureConfigDir: vi.fn(),
}));

// Mock the fs module
vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    unlinkSync: vi.fn(),
    renameSync: vi.fn(),
  };
});

import { existsSync, readFileSync, writeFileSync, unlinkSync, renameSync } from "fs";
import { loadAuth, saveAuth, clearAuth, type AuthData } from "../core/auth.js";

const mockedExistsSync = vi.mocked(existsSync);
const mockedReadFileSync = vi.mocked(readFileSync);
const mockedWriteFileSync = vi.mocked(writeFileSync);
const mockedUnlinkSync = vi.mocked(unlinkSync);
const mockedRenameSync = vi.mocked(renameSync);

const AUTH_PATH = join("/mock/config", "auth.json");

function makeAuthData(overrides: Partial<AuthData> = {}): AuthData {
  return {
    accessToken: "test-access-token",
    refreshToken: "test-refresh-token",
    serverUrl: "https://example.com",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("loadAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when auth file does not exist", () => {
    mockedExistsSync.mockReturnValue(false);

    const result = loadAuth();

    expect(result).toBeNull();
  });

  it("loads and returns auth data from file", () => {
    const authData = makeAuthData();
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(JSON.stringify(authData));

    const result = loadAuth();

    expect(result).not.toBeNull();
    expect(result!.accessToken).toBe("test-access-token");
    expect(result!.refreshToken).toBe("test-refresh-token");
    expect(result!.serverUrl).toBe("https://example.com");
  });

  it("returns auth data with user info when present", () => {
    const authData = makeAuthData({
      user: { id: "user-1", name: "Test User", email: "test@example.com" },
    });
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(JSON.stringify(authData));

    const result = loadAuth();

    expect(result).not.toBeNull();
    expect(result!.user).toEqual({ id: "user-1", name: "Test User", email: "test@example.com" });
  });

  it("returns null when auth file contains invalid JSON", () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue("not valid json {{{");

    const result = loadAuth();

    expect(result).toBeNull();
  });

  it("returns null when readFileSync throws", () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockImplementation(() => {
      throw new Error("EACCES: permission denied");
    });

    const result = loadAuth();

    expect(result).toBeNull();
  });

  it("clears auth and returns null when refreshExpiresAt is in the past", () => {
    const authData = makeAuthData({
      refreshExpiresAt: new Date(Date.now() - 60_000).toISOString(),
    });
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(JSON.stringify(authData));

    const result = loadAuth();

    expect(result).toBeNull();
    expect(mockedUnlinkSync).toHaveBeenCalledWith(AUTH_PATH);
  });

  it("returns auth when refreshExpiresAt is in the future", () => {
    const authData = makeAuthData({
      refreshExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    });
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(JSON.stringify(authData));

    const result = loadAuth();

    expect(result).not.toBeNull();
    expect(result!.accessToken).toBe("test-access-token");
  });

  it("returns auth when refreshExpiresAt is not set (no expiry check)", () => {
    const authData = makeAuthData();
    // No refreshExpiresAt field
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(JSON.stringify(authData));

    const result = loadAuth();

    expect(result).not.toBeNull();
  });

  it("returns auth when expiresAt is set but refreshExpiresAt is not", () => {
    const authData = makeAuthData({
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
      // No refreshExpiresAt - access token may be expired but refresh session is valid
    });
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(JSON.stringify(authData));

    const result = loadAuth();

    // Should still return auth because refreshExpiresAt is not set
    expect(result).not.toBeNull();
  });
});

describe("saveAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("writes auth data to temp file and renames atomically", () => {
    const authData = makeAuthData();

    saveAuth(authData);

    expect(mockedWriteFileSync).toHaveBeenCalledWith(`${AUTH_PATH}.tmp`, expect.any(String), {
      encoding: "utf-8",
      mode: 0o600,
    });
    expect(mockedRenameSync).toHaveBeenCalledWith(`${AUTH_PATH}.tmp`, AUTH_PATH);
  });

  it("writes formatted JSON with 2-space indent", () => {
    const authData = makeAuthData();

    saveAuth(authData);

    const writtenContent = mockedWriteFileSync.mock.calls[0][1] as string;
    expect(writtenContent).toBe(JSON.stringify(authData, null, 2));
  });

  it("preserves all auth fields in saved data", () => {
    const authData = makeAuthData({
      user: { id: "user-1", name: "Test User", email: "test@example.com" },
      expiresAt: "2025-01-01T00:00:00Z",
      refreshExpiresAt: "2025-06-01T00:00:00Z",
    });

    saveAuth(authData);

    const writtenContent = mockedWriteFileSync.mock.calls[0][1] as string;
    const parsed = JSON.parse(writtenContent);

    expect(parsed.accessToken).toBe("test-access-token");
    expect(parsed.refreshToken).toBe("test-refresh-token");
    expect(parsed.serverUrl).toBe("https://example.com");
    expect(parsed.user).toEqual({ id: "user-1", name: "Test User", email: "test@example.com" });
    expect(parsed.expiresAt).toBe("2025-01-01T00:00:00Z");
    expect(parsed.refreshExpiresAt).toBe("2025-06-01T00:00:00Z");
  });

  it("sets file permissions to 0o600 for security", () => {
    const authData = makeAuthData();

    saveAuth(authData);

    const writeCall = mockedWriteFileSync.mock.calls[0];
    const options = writeCall[2] as { encoding: string; mode: number };
    expect(options.mode).toBe(0o600);
  });
});

describe("clearAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes auth file when it exists", () => {
    mockedExistsSync.mockReturnValue(true);

    clearAuth();

    expect(mockedUnlinkSync).toHaveBeenCalledWith(AUTH_PATH);
  });

  it("does nothing when auth file does not exist", () => {
    mockedExistsSync.mockReturnValue(false);

    clearAuth();

    expect(mockedUnlinkSync).not.toHaveBeenCalled();
  });
});
