import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

// Mock the config module
vi.mock("../core/config.js", () => ({
  getSkillsCacheDir: () => "/mock/cache/skills",
}));

// Mock the fs module
vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  return {
    ...actual,
    existsSync: vi.fn(),
  };
});

// Mock child_process
vi.mock("child_process", () => ({
  execFileSync: vi.fn(),
}));

// Mock fs utility functions
vi.mock("../utils/fs.js", () => ({
  ensureDir: vi.fn(),
  isPathWithin: vi.fn((parent: string, child: string) => child.startsWith(parent)),
  isValidRepoPathName: vi.fn(
    (name: string) => /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name) && name.length <= 100
  ),
  parseGitUrl: vi.fn(),
}));

import { existsSync } from "fs";
import { execFileSync } from "child_process";
import {
  cloneRepo,
  updateRepo,
  getRepoCommit,
  getCachedRepoPath,
  getCommitMessages,
} from "../core/git.js";

const mockedExistsSync = vi.mocked(existsSync);
// Use a more flexible mock type to avoid Buffer type incompatibilities
const mockedExecFileSync = execFileSync as Mock;

describe("cloneRepo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: git is installed
    mockedExecFileSync.mockImplementation((cmd: string, args?: readonly string[]) => {
      if (cmd === "git" && args?.[0] === "--version") {
        return "git version 2.40.0";
      }
      return "";
    });
  });

  it("returns existing path if repo already cloned", async () => {
    mockedExistsSync.mockReturnValue(true);

    const result = await cloneRepo("owner", "repo");

    expect(result.success).toBe(true);
    expect(result.path).toBe("/mock/cache/skills/owner-repo");
  });

  it("clones repo if not already cached", async () => {
    mockedExistsSync.mockReturnValue(false);
    mockedExecFileSync.mockImplementation((cmd: string, args?: readonly string[]) => {
      if (cmd === "git" && args?.[0] === "--version") {
        return "git version 2.40.0";
      }
      if (cmd === "git" && args?.[0] === "clone") {
        return "";
      }
      return "";
    });

    const result = await cloneRepo("owner", "repo");

    expect(result.success).toBe(true);
    expect(mockedExecFileSync).toHaveBeenCalledWith(
      "git",
      [
        "clone",
        "--depth",
        "1",
        "https://github.com/owner/repo.git",
        "/mock/cache/skills/owner-repo",
      ],
      expect.any(Object)
    );
  });

  it("validates owner name", async () => {
    mockedExistsSync.mockReturnValue(false);

    await expect(cloneRepo("invalid/owner", "repo")).rejects.toThrow(
      "Invalid repository owner name"
    );
  });

  it("validates repo name", async () => {
    mockedExistsSync.mockReturnValue(false);

    await expect(cloneRepo("owner", "invalid/repo")).rejects.toThrow("Invalid repository name");
  });

  it("returns error when clone fails", async () => {
    mockedExistsSync.mockReturnValue(false);
    mockedExecFileSync.mockImplementation((cmd: string, args?: readonly string[]) => {
      if (cmd === "git" && args?.[0] === "--version") {
        return "git version 2.40.0";
      }
      if (cmd === "git" && args?.[0] === "clone") {
        const error = new Error("Clone failed");
        (error as Error & { stderr: string }).stderr = "Repository not found";
        throw error;
      }
      return "";
    });

    const result = await cloneRepo("owner", "nonexistent");

    expect(result.success).toBe(false);
    expect(result.error).toContain("Repository not found");
  });
});

describe("updateRepo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedExecFileSync.mockImplementation((cmd: string, args?: readonly string[]) => {
      if (cmd === "git" && args?.[0] === "--version") {
        return "git version 2.40.0";
      }
      return "";
    });
  });

  it("clones if repo does not exist", async () => {
    mockedExistsSync.mockReturnValue(false);

    const result = await updateRepo("owner", "repo");

    expect(result.success).toBe(true);
    expect(result.updated).toBe(true);
  });

  it("pulls updates for existing repo", async () => {
    mockedExistsSync.mockReturnValue(true);
    let callCount = 0;
    mockedExecFileSync.mockImplementation((cmd: string, args?: readonly string[]) => {
      if (cmd === "git" && args?.[0] === "--version") {
        return "git version 2.40.0";
      }
      if (cmd === "git" && args?.[0] === "rev-parse") {
        callCount++;
        // Return different commits to indicate update
        return callCount === 1 ? "abc123" : "def456";
      }
      if (cmd === "git" && args?.[0] === "pull") {
        return "";
      }
      return "";
    });

    const result = await updateRepo("owner", "repo");

    expect(result.success).toBe(true);
    expect(result.updated).toBe(true);
    expect(result.previousCommit).toBe("abc123");
    expect(result.currentCommit).toBe("def456");
  });

  it("reports no update when commit unchanged", async () => {
    mockedExistsSync.mockReturnValue(true);
    mockedExecFileSync.mockImplementation((cmd: string, args?: readonly string[]) => {
      if (cmd === "git" && args?.[0] === "--version") {
        return "git version 2.40.0";
      }
      if (cmd === "git" && args?.[0] === "rev-parse") {
        return "abc123";
      }
      if (cmd === "git" && args?.[0] === "pull") {
        return "";
      }
      return "";
    });

    const result = await updateRepo("owner", "repo");

    expect(result.success).toBe(true);
    expect(result.updated).toBe(false);
  });
});

describe("getRepoCommit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null if repo does not exist", async () => {
    mockedExistsSync.mockReturnValue(false);

    const result = await getRepoCommit("owner", "repo");

    expect(result).toBeNull();
  });

  it("returns short commit hash", async () => {
    mockedExistsSync.mockReturnValue(true);
    mockedExecFileSync.mockReturnValue("abc1234");

    const result = await getRepoCommit("owner", "repo");

    expect(result).toBe("abc1234");
  });
});

describe("getCachedRepoPath", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns path if repo is cached", () => {
    mockedExistsSync.mockReturnValue(true);

    const result = getCachedRepoPath("owner", "repo");

    expect(result).toBe("/mock/cache/skills/owner-repo");
  });

  it("returns null if repo is not cached", () => {
    mockedExistsSync.mockReturnValue(false);

    const result = getCachedRepoPath("owner", "repo");

    expect(result).toBeNull();
  });
});

describe("getCommitMessages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty array if repo does not exist", () => {
    mockedExistsSync.mockReturnValue(false);

    const result = getCommitMessages("owner", "repo", "abc123", "def456");

    expect(result).toEqual([]);
  });

  it("returns commit messages between commits", () => {
    mockedExistsSync.mockReturnValue(true);
    mockedExecFileSync.mockReturnValue("abc123 First commit\ndef456 Second commit");

    const result = getCommitMessages("owner", "repo", "abc123", "def456");

    expect(result).toEqual(["abc123 First commit", "def456 Second commit"]);
  });

  it("validates commit hashes", () => {
    mockedExistsSync.mockReturnValue(true);

    // Invalid commit hashes should return empty array
    const result = getCommitMessages("owner", "repo", "invalid!", "also-invalid");

    expect(result).toEqual([]);
  });

  it("clamps limit parameter to safe range", () => {
    mockedExistsSync.mockReturnValue(true);
    mockedExecFileSync.mockReturnValue("commit msg");

    // Should use default limit of 5 for invalid values
    getCommitMessages("owner", "repo", "abc123", "def456", -1);
    getCommitMessages("owner", "repo", "abc123", "def456", 999);
    getCommitMessages("owner", "repo", "abc123", "def456", NaN);

    // Verify git was called with -5 (default) for invalid limits
    const calls = mockedExecFileSync.mock.calls.filter(
      (call) => call[0] === "git" && (call[1] as string[])?.[0] === "log"
    );

    for (const call of calls) {
      const args = call[1] as string[];
      expect(args).toContain("-5");
    }
  });
});

describe("git installation check", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the git check state by reimporting
    vi.resetModules();
  });

  it("throws helpful error when git is not installed", async () => {
    mockedExecFileSync.mockImplementation(() => {
      throw new Error("git not found");
    });

    // Need to reimport to reset the gitChecked state
    const { cloneRepo: freshCloneRepo } = await import("../core/git.js");
    mockedExistsSync.mockReturnValue(false);

    await expect(freshCloneRepo("owner", "repo")).rejects.toThrow("Git is not installed");
  });
});
