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
    renameSync: vi.fn(),
    unlinkSync: vi.fn(),
  };
});

import {
  loadManifest,
  saveManifest,
  addSkillRecord,
  removeSkillRecord,
  getSkillRecord,
  getSkillsByAgent,
  getAllInstalledSkills,
  MANIFEST_VERSION,
  type InstalledSkillRecord,
  type Manifest,
} from "../core/manifest.js";
import { existsSync, readFileSync, writeFileSync, renameSync, unlinkSync } from "fs";

const mockedExistsSync = vi.mocked(existsSync);
const mockedReadFileSync = vi.mocked(readFileSync);
const mockedWriteFileSync = vi.mocked(writeFileSync);
const mockedRenameSync = vi.mocked(renameSync);
const _mockedUnlinkSync = vi.mocked(unlinkSync);

describe("loadManifest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty manifest when file does not exist", () => {
    mockedExistsSync.mockReturnValue(false);

    const manifest = loadManifest();

    expect(manifest.version).toBe(1);
    expect(manifest.skills).toEqual([]);
  });

  it("loads existing manifest", () => {
    const existingManifest: Manifest = {
      version: 1,
      skills: [
        {
          name: "test-skill",
          agent: "claude",
          repoOwner: "owner",
          repoName: "repo",
          commitHash: "abc123",
          installedAt: "2024-01-01T00:00:00Z",
        },
      ],
    };

    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(JSON.stringify(existingManifest));

    const manifest = loadManifest();

    expect(manifest.skills).toEqual(existingManifest.skills);
  });

  it("returns empty manifest for corrupted file", () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue("invalid json {{");

    const manifest = loadManifest();

    expect(manifest.version).toBe(1);
    expect(manifest.skills).toEqual([]);
  });

  it("returns empty manifest for invalid structure", () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(
      JSON.stringify({ version: "not a number", skills: "not an array" })
    );

    const manifest = loadManifest();

    expect(manifest.version).toBe(1);
    expect(manifest.skills).toEqual([]);
  });

  it("migrates older version manifest to latest", () => {
    const oldManifest = {
      version: 0,
      skills: [
        {
          name: "skill",
          agent: "claude",
          repoOwner: "owner",
          repoName: "repo",
          commitHash: "abc123",
          installedAt: "2024-01-01T00:00:00Z",
        },
      ],
    };

    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(JSON.stringify(oldManifest));

    const manifest = loadManifest();

    expect(manifest.version).toBe(MANIFEST_VERSION);
    expect(manifest.skills.length).toBe(1);
    // Should save migrated manifest
    expect(mockedWriteFileSync).toHaveBeenCalled();
  });
});

describe("MANIFEST_VERSION", () => {
  it("exports MANIFEST_VERSION constant", () => {
    expect(typeof MANIFEST_VERSION).toBe("number");
    expect(MANIFEST_VERSION).toBeGreaterThan(0);
  });
});

describe("saveManifest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("saves manifest with atomic write", () => {
    const manifest: Manifest = {
      version: 1,
      skills: [],
    };

    saveManifest(manifest);

    // Should write to temp file first
    expect(mockedWriteFileSync).toHaveBeenCalledWith(
      join("/mock/config", "manifest.json.tmp"),
      expect.any(String),
      "utf-8"
    );

    // Then rename atomically
    expect(mockedRenameSync).toHaveBeenCalledWith(
      join("/mock/config", "manifest.json.tmp"),
      join("/mock/config", "manifest.json")
    );
  });
});

describe("addSkillRecord", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // No lock file exists initially
    mockedExistsSync.mockImplementation((path) => {
      if (typeof path === "string") {
        if (path.endsWith("manifest.lock")) return false;
        if (path.endsWith("manifest.json")) return false;
      }
      return false;
    });
    // Empty manifest
    mockedReadFileSync.mockReturnValue(JSON.stringify({ version: 1, skills: [] }));
  });

  it("adds a new skill record", () => {
    const record: InstalledSkillRecord = {
      name: "new-skill",
      agent: "claude",
      repoOwner: "owner",
      repoName: "repo",
      commitHash: "abc123",
      installedAt: "2024-01-01T00:00:00Z",
      scope: "project",
    };

    addSkillRecord(record);

    // Should save manifest with new record
    expect(mockedWriteFileSync).toHaveBeenCalled();
    const savedData = mockedWriteFileSync.mock.calls.find(
      (call) => typeof call[0] === "string" && call[0].endsWith(".tmp")
    );
    const savedManifest = JSON.parse(savedData?.[1] as string);
    expect(savedManifest.skills).toContainEqual(record);
  });

  it("replaces existing record for same skill+agent+scope", () => {
    const existingManifest = {
      version: 1,
      skills: [
        {
          name: "existing-skill",
          agent: "claude",
          repoOwner: "old-owner",
          repoName: "old-repo",
          commitHash: "old123",
          installedAt: "2024-01-01T00:00:00Z",
          scope: "project",
        },
      ],
    };

    mockedExistsSync.mockImplementation((path) => {
      if (typeof path === "string") {
        if (path.endsWith("manifest.lock")) return false;
        if (path.endsWith("manifest.json")) return true;
      }
      return false;
    });
    mockedReadFileSync.mockReturnValue(JSON.stringify(existingManifest));

    const record: InstalledSkillRecord = {
      name: "existing-skill",
      agent: "claude",
      repoOwner: "new-owner",
      repoName: "new-repo",
      commitHash: "new123",
      installedAt: "2024-01-02T00:00:00Z",
      scope: "project",
    };

    addSkillRecord(record);

    const savedData = mockedWriteFileSync.mock.calls.find(
      (call) => typeof call[0] === "string" && call[0].endsWith(".tmp")
    );
    const savedManifest = JSON.parse(savedData?.[1] as string);
    expect(savedManifest.skills.length).toBe(1);
    expect(savedManifest.skills[0].repoOwner).toBe("new-owner");
  });

  it("keeps separate records for different scopes", () => {
    const existingManifest = {
      version: 1,
      skills: [
        {
          name: "skill",
          agent: "claude",
          repoOwner: "owner",
          repoName: "repo",
          commitHash: "abc123",
          installedAt: "2024-01-01T00:00:00Z",
          scope: "project",
        },
      ],
    };

    mockedExistsSync.mockImplementation((path) => {
      if (typeof path === "string") {
        if (path.endsWith("manifest.lock")) return false;
        if (path.endsWith("manifest.json")) return true;
      }
      return false;
    });
    mockedReadFileSync.mockReturnValue(JSON.stringify(existingManifest));

    const record: InstalledSkillRecord = {
      name: "skill",
      agent: "claude",
      repoOwner: "owner",
      repoName: "repo",
      commitHash: "def456",
      installedAt: "2024-01-02T00:00:00Z",
      scope: "global",
    };

    addSkillRecord(record);

    const savedData = mockedWriteFileSync.mock.calls.find(
      (call) => typeof call[0] === "string" && call[0].endsWith(".tmp")
    );
    const savedManifest = JSON.parse(savedData?.[1] as string);
    expect(savedManifest.skills.length).toBe(2);
  });
});

describe("removeSkillRecord", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedExistsSync.mockImplementation((path) => {
      if (typeof path === "string") {
        if (path.endsWith("manifest.lock")) return false;
        if (path.endsWith("manifest.json")) return true;
      }
      return false;
    });
  });

  it("removes a skill record", () => {
    const existingManifest = {
      version: 1,
      skills: [
        {
          name: "skill-1",
          agent: "claude",
          repoOwner: "owner",
          repoName: "repo",
          commitHash: "abc123",
          installedAt: "2024-01-01T00:00:00Z",
          scope: "project",
        },
        {
          name: "skill-2",
          agent: "claude",
          repoOwner: "owner",
          repoName: "repo",
          commitHash: "def456",
          installedAt: "2024-01-01T00:00:00Z",
          scope: "project",
        },
      ],
    };

    mockedReadFileSync.mockReturnValue(JSON.stringify(existingManifest));

    removeSkillRecord("skill-1", "claude", "project");

    const savedData = mockedWriteFileSync.mock.calls.find(
      (call) => typeof call[0] === "string" && call[0].endsWith(".tmp")
    );
    const savedManifest = JSON.parse(savedData?.[1] as string);
    expect(savedManifest.skills.length).toBe(1);
    expect(savedManifest.skills[0].name).toBe("skill-2");
  });

  it("only removes matching scope", () => {
    const existingManifest = {
      version: 1,
      skills: [
        {
          name: "skill",
          agent: "claude",
          repoOwner: "owner",
          repoName: "repo",
          commitHash: "abc123",
          installedAt: "2024-01-01T00:00:00Z",
          scope: "project",
        },
        {
          name: "skill",
          agent: "claude",
          repoOwner: "owner",
          repoName: "repo",
          commitHash: "def456",
          installedAt: "2024-01-01T00:00:00Z",
          scope: "global",
        },
      ],
    };

    mockedReadFileSync.mockReturnValue(JSON.stringify(existingManifest));

    removeSkillRecord("skill", "claude", "project");

    const savedData = mockedWriteFileSync.mock.calls.find(
      (call) => typeof call[0] === "string" && call[0].endsWith(".tmp")
    );
    const savedManifest = JSON.parse(savedData?.[1] as string);
    expect(savedManifest.skills.length).toBe(1);
    expect(savedManifest.skills[0].scope).toBe("global");
  });
});

describe("getSkillRecord", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedExistsSync.mockReturnValue(true);
  });

  it("returns skill record by name and agent", () => {
    const manifest = {
      version: 1,
      skills: [
        {
          name: "skill",
          agent: "claude",
          repoOwner: "owner",
          repoName: "repo",
          commitHash: "abc123",
          installedAt: "2024-01-01T00:00:00Z",
        },
      ],
    };

    mockedReadFileSync.mockReturnValue(JSON.stringify(manifest));

    const record = getSkillRecord("skill", "claude");

    expect(record?.name).toBe("skill");
    expect(record?.agent).toBe("claude");
  });

  it("returns undefined for non-existent skill", () => {
    mockedReadFileSync.mockReturnValue(JSON.stringify({ version: 1, skills: [] }));

    const record = getSkillRecord("nonexistent", "claude");

    expect(record).toBeUndefined();
  });

  it("filters by scope when provided", () => {
    const manifest = {
      version: 1,
      skills: [
        {
          name: "skill",
          agent: "claude",
          repoOwner: "owner",
          repoName: "repo",
          commitHash: "abc123",
          installedAt: "2024-01-01T00:00:00Z",
          scope: "global",
        },
      ],
    };

    mockedReadFileSync.mockReturnValue(JSON.stringify(manifest));

    expect(getSkillRecord("skill", "claude", "global")).toBeDefined();
    expect(getSkillRecord("skill", "claude", "project")).toBeUndefined();
  });
});

describe("getSkillsByAgent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedExistsSync.mockReturnValue(true);
  });

  it("returns all skills for an agent", () => {
    const manifest = {
      version: 1,
      skills: [
        {
          name: "skill-1",
          agent: "claude",
          repoOwner: "o",
          repoName: "r",
          commitHash: "a",
          installedAt: "2024",
        },
        {
          name: "skill-2",
          agent: "claude",
          repoOwner: "o",
          repoName: "r",
          commitHash: "b",
          installedAt: "2024",
        },
        {
          name: "skill-3",
          agent: "cursor",
          repoOwner: "o",
          repoName: "r",
          commitHash: "c",
          installedAt: "2024",
        },
      ],
    };

    mockedReadFileSync.mockReturnValue(JSON.stringify(manifest));

    const claudeSkills = getSkillsByAgent("claude");
    const cursorSkills = getSkillsByAgent("cursor");

    expect(claudeSkills.length).toBe(2);
    expect(cursorSkills.length).toBe(1);
    expect(cursorSkills[0].name).toBe("skill-3");
  });
});

describe("getAllInstalledSkills", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedExistsSync.mockReturnValue(true);
  });

  it("returns all skills from manifest", () => {
    const manifest = {
      version: 1,
      skills: [
        {
          name: "skill-1",
          agent: "claude",
          repoOwner: "o",
          repoName: "r",
          commitHash: "a",
          installedAt: "2024",
        },
        {
          name: "skill-2",
          agent: "cursor",
          repoOwner: "o",
          repoName: "r",
          commitHash: "b",
          installedAt: "2024",
        },
      ],
    };

    mockedReadFileSync.mockReturnValue(JSON.stringify(manifest));

    const skills = getAllInstalledSkills();

    expect(skills.length).toBe(2);
  });
});
