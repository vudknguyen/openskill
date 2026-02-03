import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock config module
vi.mock("../core/config.js", () => ({
  getReposCacheDir: () => "/mock/cache/repos",
  getSkillsCacheDir: () => "/mock/cache/skills",
  loadConfig: vi.fn(),
}));

// Mock git module
vi.mock("../core/git.js", () => ({
  updateRepo: vi.fn(),
}));

// Mock skill module
vi.mock("../core/skill.js", () => ({
  discoverSkills: vi.fn(),
}));

// Mock fs
vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
  };
});

// Mock fs utilities
vi.mock("../utils/fs.js", () => ({
  parseGitUrl: vi.fn(),
  isPathWithin: vi.fn((parent: string, child: string) => {
    const normalizedParent = parent.replace(/[\\/]/g, "/");
    const normalizedChild = child.replace(/[\\/]/g, "/");
    return normalizedChild.startsWith(normalizedParent);
  }),
  isValidConfigRepoName: vi.fn(
    (name: string) => /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name) && name.length <= 100,
  ),
}));

// Mock logger
vi.mock("../utils/logger.js", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

import { existsSync, readFileSync, writeFileSync } from "fs";
import { loadConfig } from "../core/config.js";
import { updateRepo } from "../core/git.js";
import { discoverSkills } from "../core/skill.js";
import { parseGitUrl, isValidConfigRepoName } from "../utils/fs.js";
import {
  refreshRepo,
  loadRepoCache,
  searchSkills,
  refreshAllRepos,
  getSkillFromRepo,
  getRepoInfo,
  getAllRepoSkills,
  type RepoSkill,
} from "../core/registry.js";

const mockedExistsSync = vi.mocked(existsSync);
const mockedReadFileSync = vi.mocked(readFileSync);
const mockedWriteFileSync = vi.mocked(writeFileSync);
const mockedLoadConfig = vi.mocked(loadConfig);
const mockedUpdateRepo = vi.mocked(updateRepo);
const mockedDiscoverSkills = vi.mocked(discoverSkills);
const mockedParseGitUrl = vi.mocked(parseGitUrl);
const mockedIsValidConfigRepoName = vi.mocked(isValidConfigRepoName);

function makeRepoSkill(overrides: Partial<RepoSkill> = {}): RepoSkill {
  return {
    name: "test-skill",
    description: "A test skill",
    path: "/mock/path/to/skill",
    relativePath: "skills/test-skill",
    repo: "test-repo",
    repoOwner: "owner",
    repoName: "repo",
    skillPath: "skills/test-skill",
    ...overrides,
  };
}

describe("loadRepoCache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedIsValidConfigRepoName.mockReturnValue(true);
  });

  it("returns empty array when cache file does not exist", () => {
    mockedExistsSync.mockReturnValue(false);

    const skills = loadRepoCache("test-repo");

    expect(skills).toEqual([]);
  });

  it("returns skills from cached file", () => {
    const cachedSkills = [makeRepoSkill()];
    const cache = { lastUpdated: "2024-01-01T00:00:00Z", skills: cachedSkills };
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(JSON.stringify(cache));

    const skills = loadRepoCache("test-repo");

    expect(skills).toEqual(cachedSkills);
  });

  it("returns empty array for corrupted cache file", () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue("invalid json {{{");

    const skills = loadRepoCache("test-repo");

    expect(skills).toEqual([]);
  });

  it("returns empty array when cache has invalid structure (skills is not array)", () => {
    const badCache = { lastUpdated: "2024-01-01T00:00:00Z", skills: "not-an-array" };
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(JSON.stringify(badCache));

    const skills = loadRepoCache("test-repo");

    expect(skills).toEqual([]);
  });

  it("returns empty array when skills field is missing", () => {
    const badCache = { lastUpdated: "2024-01-01T00:00:00Z" };
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(JSON.stringify(badCache));

    const skills = loadRepoCache("test-repo");

    expect(skills).toEqual([]);
  });

  it("throws on invalid repo name (path traversal prevention)", () => {
    mockedIsValidConfigRepoName.mockReturnValue(false);

    expect(() => loadRepoCache("../../../etc")).toThrow("Invalid repository name");
  });
});

describe("refreshRepo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedIsValidConfigRepoName.mockReturnValue(true);
  });

  it("throws when git URL is invalid", async () => {
    mockedParseGitUrl.mockReturnValue(null);

    await expect(refreshRepo("test-repo", "not-a-url")).rejects.toThrow(
      "Invalid repository URL",
    );
  });

  it("throws when repo update fails", async () => {
    mockedParseGitUrl.mockReturnValue({
      host: "github.com",
      owner: "owner",
      repo: "repo",
      cloneUrl: "https://github.com/owner/repo.git",
    });
    mockedUpdateRepo.mockResolvedValue({
      success: false,
      error: "Network error",
      updated: false,
    });

    await expect(refreshRepo("test-repo", "https://github.com/owner/repo")).rejects.toThrow(
      "Failed to fetch repository",
    );
  });

  it("discovers skills, caches results, and returns them", async () => {
    mockedParseGitUrl.mockReturnValue({
      host: "github.com",
      owner: "owner",
      repo: "repo",
      cloneUrl: "https://github.com/owner/repo.git",
    });
    mockedUpdateRepo.mockResolvedValue({ success: true, updated: true });
    mockedDiscoverSkills.mockReturnValue([
      {
        name: "my-skill",
        description: "A discovered skill",
        path: "/mock/cache/repos/../skills/owner-repo/skills/my-skill",
        relativePath: "skills/my-skill",
      },
    ]);

    const skills = await refreshRepo("test-repo", "https://github.com/owner/repo");

    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe("my-skill");
    expect(skills[0].repo).toBe("test-repo");
    expect(skills[0].repoOwner).toBe("owner");
    expect(skills[0].repoName).toBe("repo");
    expect(skills[0].skillPath).toBe("skills/my-skill");
    // Should write cache file
    expect(mockedWriteFileSync).toHaveBeenCalled();
  });

  it("returns empty array when no skills discovered", async () => {
    mockedParseGitUrl.mockReturnValue({
      host: "github.com",
      owner: "owner",
      repo: "repo",
      cloneUrl: "https://github.com/owner/repo.git",
    });
    mockedUpdateRepo.mockResolvedValue({ success: true, updated: true });
    mockedDiscoverSkills.mockReturnValue([]);

    const skills = await refreshRepo("test-repo", "https://github.com/owner/repo");

    expect(skills).toEqual([]);
    expect(mockedWriteFileSync).toHaveBeenCalled();
  });
});

describe("searchSkills", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedIsValidConfigRepoName.mockReturnValue(true);
  });

  it("searches across all repos using cached skills", async () => {
    mockedLoadConfig.mockReturnValue({
      version: 3,
      defaultAgent: "claude",
      defaultScope: "project",
      serverUrl: "http://localhost:3000",
      repos: [{ name: "repo-a", url: "https://github.com/a/skills" }],
      agents: {},
    });

    const cachedSkills = [
      makeRepoSkill({ name: "deploy-aws", description: "Deploy to AWS" }),
      makeRepoSkill({ name: "lint-code", description: "Lint source code" }),
    ];
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(
      JSON.stringify({ lastUpdated: "2024-01-01T00:00:00Z", skills: cachedSkills }),
    );

    const results = await searchSkills("deploy");

    expect(results).toHaveLength(1);
    expect(results[0].name).toBe("deploy-aws");
  });

  it("matches against description as well as name", async () => {
    mockedLoadConfig.mockReturnValue({
      version: 3,
      defaultAgent: "claude",
      defaultScope: "project",
      serverUrl: "http://localhost:3000",
      repos: [{ name: "repo-a", url: "https://github.com/a/skills" }],
      agents: {},
    });

    const cachedSkills = [
      makeRepoSkill({ name: "my-tool", description: "Helps deploy to AWS" }),
    ];
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(
      JSON.stringify({ lastUpdated: "2024-01-01T00:00:00Z", skills: cachedSkills }),
    );

    const results = await searchSkills("deploy");

    expect(results).toHaveLength(1);
    expect(results[0].name).toBe("my-tool");
  });

  it("performs case-insensitive search", async () => {
    mockedLoadConfig.mockReturnValue({
      version: 3,
      defaultAgent: "claude",
      defaultScope: "project",
      serverUrl: "http://localhost:3000",
      repos: [{ name: "repo-a", url: "https://github.com/a/skills" }],
      agents: {},
    });

    const cachedSkills = [
      makeRepoSkill({ name: "Deploy-AWS", description: "Deploy to AWS" }),
    ];
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(
      JSON.stringify({ lastUpdated: "2024-01-01T00:00:00Z", skills: cachedSkills }),
    );

    const results = await searchSkills("deploy");

    expect(results).toHaveLength(1);
  });

  it("refreshes repo cache when cache is empty", async () => {
    mockedLoadConfig.mockReturnValue({
      version: 3,
      defaultAgent: "claude",
      defaultScope: "project",
      serverUrl: "http://localhost:3000",
      repos: [{ name: "repo-a", url: "https://github.com/a/skills" }],
      agents: {},
    });

    // First call: cache miss (empty), second call: after refresh has populated
    mockedExistsSync.mockReturnValue(false);
    mockedParseGitUrl.mockReturnValue({
      host: "github.com",
      owner: "a",
      repo: "skills",
      cloneUrl: "https://github.com/a/skills.git",
    });
    mockedUpdateRepo.mockResolvedValue({ success: true, updated: true });
    mockedDiscoverSkills.mockReturnValue([
      {
        name: "refreshed-skill",
        description: "A refreshed skill",
        path: "/some/path",
        relativePath: "skills/refreshed-skill",
      },
    ]);

    const results = await searchSkills("refreshed");

    expect(results).toHaveLength(1);
    expect(results[0].name).toBe("refreshed-skill");
  });

  it("continues when a repo refresh fails", async () => {
    mockedLoadConfig.mockReturnValue({
      version: 3,
      defaultAgent: "claude",
      defaultScope: "project",
      serverUrl: "http://localhost:3000",
      repos: [
        { name: "broken-repo", url: "https://github.com/broken/repo" },
        { name: "good-repo", url: "https://github.com/good/repo" },
      ],
      agents: {},
    });

    // broken-repo has no cache, refresh fails
    let callCount = 0;
    mockedExistsSync.mockImplementation(() => {
      callCount++;
      // broken-repo cache miss, then good-repo cache exists
      return callCount > 1;
    });
    mockedParseGitUrl.mockReturnValue(null); // causes refreshRepo to throw

    const goodSkills = [makeRepoSkill({ name: "good-skill", description: "Works fine" })];
    mockedReadFileSync.mockReturnValue(
      JSON.stringify({ lastUpdated: "2024-01-01T00:00:00Z", skills: goodSkills }),
    );

    const results = await searchSkills("good");

    expect(results).toHaveLength(1);
    expect(results[0].name).toBe("good-skill");
  });

  it("returns empty array when no skills match query", async () => {
    mockedLoadConfig.mockReturnValue({
      version: 3,
      defaultAgent: "claude",
      defaultScope: "project",
      serverUrl: "http://localhost:3000",
      repos: [{ name: "repo-a", url: "https://github.com/a/skills" }],
      agents: {},
    });

    const cachedSkills = [makeRepoSkill({ name: "deploy-aws", description: "Deploy to AWS" })];
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(
      JSON.stringify({ lastUpdated: "2024-01-01T00:00:00Z", skills: cachedSkills }),
    );

    const results = await searchSkills("kubernetes");

    expect(results).toEqual([]);
  });
});

describe("refreshAllRepos", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedIsValidConfigRepoName.mockReturnValue(true);
  });

  it("refreshes all repos and reports successes", async () => {
    mockedLoadConfig.mockReturnValue({
      version: 3,
      defaultAgent: "claude",
      defaultScope: "project",
      serverUrl: "http://localhost:3000",
      repos: [
        { name: "repo-a", url: "https://github.com/a/skills" },
        { name: "repo-b", url: "https://github.com/b/skills" },
      ],
      agents: {},
    });

    mockedParseGitUrl.mockReturnValue({
      host: "github.com",
      owner: "owner",
      repo: "repo",
      cloneUrl: "https://github.com/owner/repo.git",
    });
    mockedUpdateRepo.mockResolvedValue({ success: true, updated: true });
    mockedDiscoverSkills.mockReturnValue([]);

    const result = await refreshAllRepos();

    expect(result.succeeded).toEqual(["repo-a", "repo-b"]);
    expect(result.failed).toEqual([]);
  });

  it("reports failures alongside successes", async () => {
    mockedLoadConfig.mockReturnValue({
      version: 3,
      defaultAgent: "claude",
      defaultScope: "project",
      serverUrl: "http://localhost:3000",
      repos: [
        { name: "good-repo", url: "https://github.com/good/repo" },
        { name: "bad-repo", url: "not-a-url" },
      ],
      agents: {},
    });

    let callCount = 0;
    mockedParseGitUrl.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return { host: "github.com", owner: "good", repo: "repo", cloneUrl: "https://github.com/good/repo.git" };
      }
      return null; // second call fails
    });
    mockedUpdateRepo.mockResolvedValue({ success: true, updated: true });
    mockedDiscoverSkills.mockReturnValue([]);

    const result = await refreshAllRepos();

    expect(result.succeeded).toEqual(["good-repo"]);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].repo).toBe("bad-repo");
    expect(result.failed[0].error).toContain("Invalid repository URL");
  });

  it("handles empty repos list", async () => {
    mockedLoadConfig.mockReturnValue({
      version: 3,
      defaultAgent: "claude",
      defaultScope: "project",
      serverUrl: "http://localhost:3000",
      repos: [],
      agents: {},
    });

    const result = await refreshAllRepos();

    expect(result.succeeded).toEqual([]);
    expect(result.failed).toEqual([]);
  });
});

describe("getSkillFromRepo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedIsValidConfigRepoName.mockReturnValue(true);
  });

  it("returns skill by name from cached repo", () => {
    const skills = [
      makeRepoSkill({ name: "skill-a" }),
      makeRepoSkill({ name: "skill-b" }),
    ];
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(
      JSON.stringify({ lastUpdated: "2024-01-01T00:00:00Z", skills }),
    );

    const result = getSkillFromRepo("test-repo", "skill-b");

    expect(result).not.toBeNull();
    expect(result!.name).toBe("skill-b");
  });

  it("returns null when skill is not found", () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(
      JSON.stringify({ lastUpdated: "2024-01-01T00:00:00Z", skills: [] }),
    );

    const result = getSkillFromRepo("test-repo", "nonexistent");

    expect(result).toBeNull();
  });

  it("returns null when cache does not exist", () => {
    mockedExistsSync.mockReturnValue(false);

    const result = getSkillFromRepo("test-repo", "any-skill");

    expect(result).toBeNull();
  });
});

describe("getRepoInfo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedIsValidConfigRepoName.mockReturnValue(true);
  });

  it("returns repo info with skill count and last updated from cache", () => {
    const cache = {
      lastUpdated: "2024-06-15T10:30:00Z",
      skills: [makeRepoSkill(), makeRepoSkill({ name: "skill-2" })],
    };
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(JSON.stringify(cache));

    const info = getRepoInfo("test-repo", "https://github.com/test/repo");

    expect(info.name).toBe("test-repo");
    expect(info.url).toBe("https://github.com/test/repo");
    expect(info.skillCount).toBe(2);
    expect(info.lastUpdated).toBe("2024-06-15T10:30:00Z");
  });

  it("returns defaults when cache does not exist", () => {
    mockedExistsSync.mockReturnValue(false);

    const info = getRepoInfo("new-repo", "https://github.com/new/repo");

    expect(info.name).toBe("new-repo");
    expect(info.url).toBe("https://github.com/new/repo");
    expect(info.skillCount).toBe(0);
    expect(info.lastUpdated).toBeNull();
  });

  it("returns defaults when cache is corrupted", () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue("invalid json");

    const info = getRepoInfo("broken-repo", "https://github.com/broken/repo");

    expect(info.skillCount).toBe(0);
    expect(info.lastUpdated).toBeNull();
  });

  it("returns zero skill count when cache has invalid skills structure", () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(
      JSON.stringify({ lastUpdated: "2024-01-01", skills: "not-array" }),
    );

    const info = getRepoInfo("repo", "https://github.com/test/repo");

    expect(info.skillCount).toBe(0);
  });
});

describe("getAllRepoSkills", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedIsValidConfigRepoName.mockReturnValue(true);
  });

  it("aggregates skills from all repos", () => {
    mockedLoadConfig.mockReturnValue({
      version: 3,
      defaultAgent: "claude",
      defaultScope: "project",
      serverUrl: "http://localhost:3000",
      repos: [
        { name: "repo-a", url: "https://github.com/a/skills" },
        { name: "repo-b", url: "https://github.com/b/skills" },
      ],
      agents: {},
    });

    mockedExistsSync.mockReturnValue(true);

    let callCount = 0;
    mockedReadFileSync.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return JSON.stringify({
          lastUpdated: "2024-01-01T00:00:00Z",
          skills: [makeRepoSkill({ name: "skill-from-a", repo: "repo-a" })],
        });
      }
      return JSON.stringify({
        lastUpdated: "2024-01-01T00:00:00Z",
        skills: [
          makeRepoSkill({ name: "skill-from-b-1", repo: "repo-b" }),
          makeRepoSkill({ name: "skill-from-b-2", repo: "repo-b" }),
        ],
      });
    });

    const allSkills = getAllRepoSkills();

    expect(allSkills).toHaveLength(3);
    expect(allSkills.map((s) => s.name)).toContain("skill-from-a");
    expect(allSkills.map((s) => s.name)).toContain("skill-from-b-1");
    expect(allSkills.map((s) => s.name)).toContain("skill-from-b-2");
  });

  it("returns empty array when no repos configured", () => {
    mockedLoadConfig.mockReturnValue({
      version: 3,
      defaultAgent: "claude",
      defaultScope: "project",
      serverUrl: "http://localhost:3000",
      repos: [],
      agents: {},
    });

    const allSkills = getAllRepoSkills();

    expect(allSkills).toEqual([]);
  });
});
