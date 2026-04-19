import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock marketplace client
const { mockGetSkillVersions, mockCreateMarketplaceClient } = vi.hoisted(() => {
  const mockGetSkillVersions = vi.fn();
  return {
    mockGetSkillVersions,
    mockCreateMarketplaceClient: vi.fn().mockReturnValue({
      getSkillVersions: mockGetSkillVersions,
    }),
  };
});

vi.mock("../core/marketplace-client.js", () => ({
  createMarketplaceClient: mockCreateMarketplaceClient,
}));

import type { InstalledSkillRecord } from "../core/manifest.js";
import { checkMarketplaceUpdates } from "../core/marketplace-update-checker.js";

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

beforeEach(() => {
  vi.clearAllMocks();
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
    expect(mockGetSkillVersions).not.toHaveBeenCalled();
  });

  it("detects update when latest hash differs from installed hash", async () => {
    const skill = makeSkillRecord({
      commitHash: "oldhash123",
      marketplaceVersion: "1.0.0",
    });

    mockGetSkillVersions.mockResolvedValue({
      versions: [
        { version: "1.0.0", fileHash: "oldhash123", changelog: null, isLatest: false },
        {
          version: "2.0.0",
          fileHash: "newhash456",
          changelog: "Bug fixes and improvements",
          isLatest: true,
        },
      ],
    });

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

    mockGetSkillVersions.mockResolvedValue({
      versions: [{ version: "1.0.0", fileHash: "samehash", changelog: null, isLatest: true }],
    });

    const updates = await checkMarketplaceUpdates([skill]);
    expect(updates).toEqual([]);
  });

  it("skips skill when API throws", async () => {
    const skill = makeSkillRecord();

    mockGetSkillVersions.mockRejectedValue(new Error("Failed to fetch versions (404)"));

    const updates = await checkMarketplaceUpdates([skill]);
    expect(updates).toEqual([]);
  });

  it("skips skill when versions array is empty", async () => {
    const skill = makeSkillRecord();

    mockGetSkillVersions.mockResolvedValue({ versions: [] });

    const updates = await checkMarketplaceUpdates([skill]);
    expect(updates).toEqual([]);
  });

  it("skips skill when versions field is missing", async () => {
    const skill = makeSkillRecord();

    mockGetSkillVersions.mockResolvedValue({});

    const updates = await checkMarketplaceUpdates([skill]);
    expect(updates).toEqual([]);
  });

  it("skips skill when latest version has null fileHash", async () => {
    const skill = makeSkillRecord();

    mockGetSkillVersions.mockResolvedValue({
      versions: [{ version: "2.0.0", fileHash: null, changelog: null, isLatest: true }],
    });

    const updates = await checkMarketplaceUpdates([skill]);
    expect(updates).toEqual([]);
  });

  it("falls back to first version when no version is marked isLatest", async () => {
    const skill = makeSkillRecord({ commitHash: "oldhash" });

    mockGetSkillVersions.mockResolvedValue({
      versions: [
        { version: "1.5.0", fileHash: "fallbackhash", changelog: "Fallback", isLatest: false },
        { version: "1.0.0", fileHash: "oldhash", changelog: null, isLatest: false },
      ],
    });

    const updates = await checkMarketplaceUpdates([skill]);

    expect(updates).toHaveLength(1);
    expect(updates[0].latestVersion).toBe("1.5.0");
    expect(updates[0].latestHash).toBe("fallbackhash");
    expect(updates[0].changelog).toBe("Fallback");
  });

  it("handles network errors gracefully by skipping the skill", async () => {
    const skill = makeSkillRecord();

    mockGetSkillVersions.mockRejectedValue(new Error("Network failure"));

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

    mockGetSkillVersions
      .mockResolvedValueOnce({
        versions: [
          { version: "2.0.0", fileHash: "hash1-new", changelog: "Updated", isLatest: true },
        ],
      })
      .mockResolvedValueOnce({
        versions: [
          { version: "2.0.0", fileHash: "hash2-current", changelog: null, isLatest: true },
        ],
      })
      .mockResolvedValueOnce({
        versions: [
          { version: "3.0.0", fileHash: "hash3-new", changelog: "Major update", isLatest: true },
        ],
      });

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

    mockGetSkillVersions.mockResolvedValue({
      versions: [{ version: "1.0.0", fileHash: "same", changelog: null, isLatest: true }],
    });

    const onProgress = vi.fn();

    await checkMarketplaceUpdates(skills, { onProgress });

    expect(onProgress).toHaveBeenCalledTimes(3);
    expect(onProgress).toHaveBeenCalledWith(1, 3);
    expect(onProgress).toHaveBeenCalledWith(2, 3);
    expect(onProgress).toHaveBeenCalledWith(3, 3);
  });

  it("passes server override to createMarketplaceClient", async () => {
    const skill = makeSkillRecord();

    mockGetSkillVersions.mockResolvedValue({
      versions: [{ version: "1.0.0", fileHash: "hash", changelog: null, isLatest: true }],
    });

    await checkMarketplaceUpdates([skill], { server: "https://custom.server.com" });

    expect(mockCreateMarketplaceClient).toHaveBeenCalledWith("https://custom.server.com");
  });

  it("passes undefined server when no override", async () => {
    const skill = makeSkillRecord();

    mockGetSkillVersions.mockResolvedValue({
      versions: [{ version: "1.0.0", fileHash: "hash", changelog: null, isLatest: true }],
    });

    await checkMarketplaceUpdates([skill]);

    expect(mockCreateMarketplaceClient).toHaveBeenCalledWith(undefined);
  });

  it("handles empty commitHash on installed skill", async () => {
    const skill = makeSkillRecord({
      commitHash: "",
      marketplaceVersion: "",
    });

    mockGetSkillVersions.mockResolvedValue({
      versions: [{ version: "1.0.0", fileHash: "newhash", changelog: null, isLatest: true }],
    });

    const updates = await checkMarketplaceUpdates([skill]);

    expect(updates).toHaveLength(1);
    expect(updates[0].currentHash).toBe("");
    expect(updates[0].currentVersion).toBe("");
  });

  it("handles missing marketplaceVersion on installed skill", async () => {
    const skill: InstalledSkillRecord = {
      name: "test-skill",
      agent: "claude",
      repoOwner: "marketplace",
      repoName: "test-skill",
      commitHash: "",
      installedAt: "2024-01-01T00:00:00Z",
      source: "marketplace",
      marketplaceSlug: "test-skill",
    };

    mockGetSkillVersions.mockResolvedValue({
      versions: [{ version: "1.0.0", fileHash: "hash", changelog: null, isLatest: true }],
    });

    const updates = await checkMarketplaceUpdates([skill]);

    expect(updates).toHaveLength(1);
    expect(updates[0].currentVersion).toBe("");
  });

  it("calls getSkillVersions with correct slug", async () => {
    const skill = makeSkillRecord({ marketplaceSlug: "my-cool-skill" });

    mockGetSkillVersions.mockResolvedValue({
      versions: [{ version: "1.0.0", fileHash: "samehash", changelog: null, isLatest: true }],
    });

    await checkMarketplaceUpdates([skill]);

    expect(mockGetSkillVersions).toHaveBeenCalledWith("my-cool-skill");
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

    mockGetSkillVersions.mockResolvedValue({
      versions: [{ version: "2.0.0", fileHash: "newhash", changelog: "New", isLatest: true }],
    });

    const updates = await checkMarketplaceUpdates([marketplaceSkill, gitSkill]);

    expect(mockGetSkillVersions).toHaveBeenCalledTimes(1);
    expect(updates).toHaveLength(1);
    expect(updates[0].slug).toBe("mp-skill");
  });
});
