import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock auth module
vi.mock("../core/auth.js", () => ({
  loadAuth: vi.fn(),
}));

// Mock config module
vi.mock("../core/config.js", () => ({
  loadConfig: vi.fn(),
}));

// Mock url utilities
vi.mock("../utils/url.js", () => ({
  validateServerUrl: vi.fn((url: string) => url),
  skillApiPath: vi.fn((slug: string, ...segments: string[]) => {
    const suffix = segments.length > 0 ? `/${segments.join("/")}` : "";
    return `/api/skills/${slug}${suffix}`;
  }),
}));

import { loadAuth } from "../core/auth.js";
import { loadConfig } from "../core/config.js";
import type { InstalledSkillRecord } from "../core/manifest.js";
import { checkMarketplaceUpdates, type MarketplaceUpdate } from "../core/marketplace-update-checker.js";

const mockLoadAuth = vi.mocked(loadAuth);
const mockLoadConfig = vi.mocked(loadConfig);

function makeSkillRecord(overrides: Partial<InstalledSkillRecord> = {}): InstalledSkillRecord {
  return {
    name: "test-skill",
    agent: "claude",
    repoOwner: "marketplace",
    repoName: "test-skill",
    commitHash: "oldhash123",
    installedAt: "2024-01-01T00:00:00Z",
    source: "marketplace",
    marketplaceSlug: "test-skill",
    marketplaceVersion: "1.0.0",
    ...overrides,
  };
}

function makeVersionsResponse(versions: Array<{
  version: string;
  fileHash: string | null;
  changelog: string | null;
  isLatest: boolean;
}>) {
  return { versions };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();

  mockLoadAuth.mockReturnValue(null);
  mockLoadConfig.mockReturnValue({
    version: 3,
    defaultAgent: "claude",
    defaultScope: "project",
    serverUrl: "http://localhost:3000",
    repos: [],
    agents: {},
  });
});

describe("checkMarketplaceUpdates", () => {
  it("returns empty array when no skills provided", async () => {
    const updates = await checkMarketplaceUpdates([]);

    expect(updates).toEqual([]);
  });

  it("skips skills without marketplaceSlug", async () => {
    const skill = makeSkillRecord({ marketplaceSlug: undefined });

    const updates = await checkMarketplaceUpdates([skill]);

    expect(updates).toEqual([]);
  });

  it("detects update when latest hash differs from installed hash", async () => {
    const skill = makeSkillRecord({
      commitHash: "oldhash123",
      marketplaceVersion: "1.0.0",
    });

    const versionsResponse = makeVersionsResponse([
      { version: "1.0.0", fileHash: "oldhash123", changelog: null, isLatest: false },
      { version: "2.0.0", fileHash: "newhash456", changelog: "Bug fixes and improvements", isLatest: true },
    ]);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(versionsResponse),
      }),
    );

    const updates = await checkMarketplaceUpdates([skill]);

    expect(updates).toHaveLength(1);
    expect(updates[0].slug).toBe("test-skill");
    expect(updates[0].currentVersion).toBe("1.0.0");
    expect(updates[0].latestVersion).toBe("2.0.0");
    expect(updates[0].currentHash).toBe("oldhash123");
    expect(updates[0].latestHash).toBe("newhash456");
    expect(updates[0].changelog).toBe("Bug fixes and improvements");
  });

  it("reports no update when hashes match", async () => {
    const skill = makeSkillRecord({
      commitHash: "samehash",
      marketplaceVersion: "1.0.0",
    });

    const versionsResponse = makeVersionsResponse([
      { version: "1.0.0", fileHash: "samehash", changelog: null, isLatest: true },
    ]);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(versionsResponse),
      }),
    );

    const updates = await checkMarketplaceUpdates([skill]);

    expect(updates).toEqual([]);
  });

  it("skips skill when API returns non-ok response", async () => {
    const skill = makeSkillRecord();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      }),
    );

    const updates = await checkMarketplaceUpdates([skill]);

    expect(updates).toEqual([]);
  });

  it("skips skill when versions array is empty", async () => {
    const skill = makeSkillRecord();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ versions: [] }),
      }),
    );

    const updates = await checkMarketplaceUpdates([skill]);

    expect(updates).toEqual([]);
  });

  it("skips skill when versions field is missing", async () => {
    const skill = makeSkillRecord();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      }),
    );

    const updates = await checkMarketplaceUpdates([skill]);

    expect(updates).toEqual([]);
  });

  it("skips skill when latest version has null fileHash", async () => {
    const skill = makeSkillRecord();

    const versionsResponse = makeVersionsResponse([
      { version: "2.0.0", fileHash: null, changelog: null, isLatest: true },
    ]);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(versionsResponse),
      }),
    );

    const updates = await checkMarketplaceUpdates([skill]);

    expect(updates).toEqual([]);
  });

  it("falls back to first version when no version is marked isLatest", async () => {
    const skill = makeSkillRecord({ commitHash: "oldhash" });

    const versionsResponse = makeVersionsResponse([
      { version: "1.5.0", fileHash: "fallbackhash", changelog: "Fallback", isLatest: false },
      { version: "1.0.0", fileHash: "oldhash", changelog: null, isLatest: false },
    ]);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(versionsResponse),
      }),
    );

    const updates = await checkMarketplaceUpdates([skill]);

    expect(updates).toHaveLength(1);
    expect(updates[0].latestVersion).toBe("1.5.0");
    expect(updates[0].latestHash).toBe("fallbackhash");
    expect(updates[0].changelog).toBe("Fallback");
  });

  it("handles network errors gracefully by skipping the skill", async () => {
    const skill = makeSkillRecord();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("Network failure")),
    );

    const updates = await checkMarketplaceUpdates([skill]);

    expect(updates).toEqual([]);
  });

  it("checks multiple skills and returns only those with updates", async () => {
    const skill1 = makeSkillRecord({
      name: "skill-1",
      marketplaceSlug: "skill-1",
      commitHash: "hash1-old",
      marketplaceVersion: "1.0.0",
    });
    const skill2 = makeSkillRecord({
      name: "skill-2",
      marketplaceSlug: "skill-2",
      commitHash: "hash2-current",
      marketplaceVersion: "2.0.0",
    });
    const skill3 = makeSkillRecord({
      name: "skill-3",
      marketplaceSlug: "skill-3",
      commitHash: "hash3-old",
      marketplaceVersion: "1.0.0",
    });

    let callIndex = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() => {
        callIndex++;
        if (callIndex === 1) {
          // skill-1: has update
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve(
                makeVersionsResponse([
                  { version: "2.0.0", fileHash: "hash1-new", changelog: "Updated", isLatest: true },
                ]),
              ),
          });
        } else if (callIndex === 2) {
          // skill-2: no update (same hash)
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve(
                makeVersionsResponse([
                  { version: "2.0.0", fileHash: "hash2-current", changelog: null, isLatest: true },
                ]),
              ),
          });
        } else {
          // skill-3: has update
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve(
                makeVersionsResponse([
                  { version: "3.0.0", fileHash: "hash3-new", changelog: "Major update", isLatest: true },
                ]),
              ),
          });
        }
      }),
    );

    const updates = await checkMarketplaceUpdates([skill1, skill2, skill3]);

    expect(updates).toHaveLength(2);
    expect(updates[0].slug).toBe("skill-1");
    expect(updates[1].slug).toBe("skill-3");
  });

  it("calls onProgress callback for each skill checked", async () => {
    const skills = [
      makeSkillRecord({ marketplaceSlug: "skill-a" }),
      makeSkillRecord({ marketplaceSlug: "skill-b" }),
      makeSkillRecord({ marketplaceSlug: "skill-c" }),
    ];

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve(
            makeVersionsResponse([
              { version: "1.0.0", fileHash: "same", changelog: null, isLatest: true },
            ]),
          ),
      }),
    );

    const onProgress = vi.fn();

    await checkMarketplaceUpdates(skills, { onProgress });

    expect(onProgress).toHaveBeenCalledTimes(3);
    expect(onProgress).toHaveBeenCalledWith(1, 3);
    expect(onProgress).toHaveBeenCalledWith(2, 3);
    expect(onProgress).toHaveBeenCalledWith(3, 3);
  });

  it("uses server URL from options", async () => {
    const skill = makeSkillRecord();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve(
            makeVersionsResponse([
              { version: "1.0.0", fileHash: "hash", changelog: null, isLatest: true },
            ]),
          ),
      }),
    );

    await checkMarketplaceUpdates([skill], { server: "https://custom.server.com" });

    const fetchCall = vi.mocked(fetch).mock.calls[0][0] as string;
    expect(fetchCall).toContain("https://custom.server.com");
  });

  it("uses server URL from auth when no options server provided", async () => {
    mockLoadAuth.mockReturnValue({
      accessToken: "token",
      refreshToken: "refresh",
      serverUrl: "https://auth-server.example.com",
      createdAt: new Date().toISOString(),
    });

    const skill = makeSkillRecord();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve(
            makeVersionsResponse([
              { version: "1.0.0", fileHash: "hash", changelog: null, isLatest: true },
            ]),
          ),
      }),
    );

    await checkMarketplaceUpdates([skill]);

    const fetchCall = vi.mocked(fetch).mock.calls[0][0] as string;
    expect(fetchCall).toContain("https://auth-server.example.com");
  });

  it("falls back to config serverUrl when no auth or options server", async () => {
    mockLoadAuth.mockReturnValue(null);
    mockLoadConfig.mockReturnValue({
      version: 3,
      defaultAgent: "claude",
      defaultScope: "project",
      serverUrl: "https://config-server.example.com",
      repos: [],
      agents: {},
    });

    const skill = makeSkillRecord();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve(
            makeVersionsResponse([
              { version: "1.0.0", fileHash: "hash", changelog: null, isLatest: true },
            ]),
          ),
      }),
    );

    await checkMarketplaceUpdates([skill]);

    const fetchCall = vi.mocked(fetch).mock.calls[0][0] as string;
    expect(fetchCall).toContain("https://config-server.example.com");
  });

  it("handles empty commitHash on installed skill", async () => {
    const skill = makeSkillRecord({
      commitHash: "",
      marketplaceVersion: "",
    });

    const versionsResponse = makeVersionsResponse([
      { version: "1.0.0", fileHash: "newhash", changelog: null, isLatest: true },
    ]);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(versionsResponse),
      }),
    );

    const updates = await checkMarketplaceUpdates([skill]);

    expect(updates).toHaveLength(1);
    expect(updates[0].currentHash).toBe("");
    expect(updates[0].currentVersion).toBe("");
  });

  it("handles missing commitHash and marketplaceVersion on installed skill", async () => {
    const skill: InstalledSkillRecord = {
      name: "test-skill",
      agent: "claude",
      repoOwner: "marketplace",
      repoName: "test-skill",
      commitHash: "", // empty string
      installedAt: "2024-01-01T00:00:00Z",
      source: "marketplace",
      marketplaceSlug: "test-skill",
      // marketplaceVersion intentionally omitted
    };

    const versionsResponse = makeVersionsResponse([
      { version: "1.0.0", fileHash: "hash", changelog: null, isLatest: true },
    ]);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(versionsResponse),
      }),
    );

    const updates = await checkMarketplaceUpdates([skill]);

    expect(updates).toHaveLength(1);
    expect(updates[0].currentVersion).toBe("");
  });

  it("correctly calls versions API endpoint for each slug", async () => {
    const skill = makeSkillRecord({ marketplaceSlug: "my-cool-skill" });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve(
            makeVersionsResponse([
              { version: "1.0.0", fileHash: "samehash", changelog: null, isLatest: true },
            ]),
          ),
      }),
    );

    await checkMarketplaceUpdates([skill]);

    const fetchCall = vi.mocked(fetch).mock.calls[0][0] as string;
    expect(fetchCall).toContain("/api/skills/my-cool-skill/versions");
  });

  it("mixes marketplace and non-marketplace skills, skipping non-marketplace", async () => {
    const marketplaceSkill = makeSkillRecord({
      name: "mp-skill",
      marketplaceSlug: "mp-skill",
      commitHash: "oldhash",
    });
    const gitSkill = makeSkillRecord({
      name: "git-skill",
      source: "git",
      marketplaceSlug: undefined,
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve(
            makeVersionsResponse([
              { version: "2.0.0", fileHash: "newhash", changelog: "New", isLatest: true },
            ]),
          ),
      }),
    );

    const updates = await checkMarketplaceUpdates([marketplaceSkill, gitSkill]);

    // Only marketplace skill checked
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(updates).toHaveLength(1);
    expect(updates[0].slug).toBe("mp-skill");
  });
});
