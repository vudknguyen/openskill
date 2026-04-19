import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock fs
vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
  };
});

// Mock fs utilities
vi.mock("../utils/fs.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../utils/fs.js")>();
  return {
    ...actual,
    findSkillDirs: vi.fn(),
    safeJoinPath: vi.fn(),
  };
});

import { existsSync, readFileSync } from "fs";
import { findSkillDirs, safeJoinPath } from "../utils/fs.js";
import {
  loadSkillFromDir,
  loadSkillInfo,
  discoverSkills,
  findSkillByName,
  validateSkillName,
  validateSkillDescription,
  extractSkillFromRepoPath,
} from "../core/skill.js";

const mockExistsSync = vi.mocked(existsSync);
const mockReadFileSync = vi.mocked(readFileSync);
const mockFindSkillDirs = vi.mocked(findSkillDirs);
const mockSafeJoinPath = vi.mocked(safeJoinPath);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("validateSkillName", () => {
  it("accepts valid skill names", () => {
    expect(validateSkillName("pdf")).toEqual({ valid: true });
    expect(validateSkillName("my-skill")).toEqual({ valid: true });
    expect(validateSkillName("skill123")).toEqual({ valid: true });
    expect(validateSkillName("a")).toEqual({ valid: true });
    expect(validateSkillName("my-cool-skill")).toEqual({ valid: true });
  });

  it("rejects empty names", () => {
    expect(validateSkillName("").valid).toBe(false);
    expect(validateSkillName("").error).toContain("empty");
  });

  it("rejects names over 64 characters", () => {
    const longName = "a".repeat(65);
    expect(validateSkillName(longName).valid).toBe(false);
    expect(validateSkillName(longName).error).toContain("64");
  });

  it("rejects names with uppercase letters", () => {
    expect(validateSkillName("MySkill").valid).toBe(false);
    expect(validateSkillName("SKILL").valid).toBe(false);
  });

  it("rejects names starting or ending with hyphen", () => {
    expect(validateSkillName("-skill").valid).toBe(false);
    expect(validateSkillName("skill-").valid).toBe(false);
  });

  it("rejects names with consecutive hyphens", () => {
    expect(validateSkillName("my--skill").valid).toBe(false);
    expect(validateSkillName("my--skill").error).toContain("consecutive");
  });

  it("rejects names with special characters", () => {
    expect(validateSkillName("my_skill").valid).toBe(false);
    expect(validateSkillName("my.skill").valid).toBe(false);
    expect(validateSkillName("my skill").valid).toBe(false);
  });
});

describe("validateSkillDescription", () => {
  it("accepts valid descriptions", () => {
    expect(validateSkillDescription("A skill for converting PDFs")).toEqual({ valid: true });
    expect(validateSkillDescription("X")).toEqual({ valid: true });
  });

  it("rejects empty descriptions", () => {
    expect(validateSkillDescription("").valid).toBe(false);
    expect(validateSkillDescription("").error).toContain("empty");
  });

  it("rejects descriptions over 1024 characters", () => {
    const longDesc = "a".repeat(1025);
    expect(validateSkillDescription(longDesc).valid).toBe(false);
    expect(validateSkillDescription(longDesc).error).toContain("1024");
  });
});

describe("loadSkillFromDir", () => {
  it("returns null when SKILL.md does not exist", () => {
    mockExistsSync.mockReturnValue(false);
    expect(loadSkillFromDir("/some/dir")).toBeNull();
  });

  it("returns parsed skill when SKILL.md exists and is valid", () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(
      "---\nname: my-skill\ndescription: A test skill\n---\n\nInstructions here."
    );

    const result = loadSkillFromDir("/some/dir");
    expect(result).not.toBeNull();
    expect(result!.frontmatter.name).toBe("my-skill");
    expect(result!.frontmatter.description).toBe("A test skill");
    expect(result!.content).toBe("Instructions here.");
  });

  it("returns null when readFileSync throws", () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockImplementation(() => {
      throw new Error("EACCES: permission denied");
    });

    expect(loadSkillFromDir("/some/dir")).toBeNull();
  });

  it("returns null when SKILL.md has invalid frontmatter", () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue("---\ntitle: no-name-field\n---\nContent");

    expect(loadSkillFromDir("/some/dir")).toBeNull();
  });
});

describe("loadSkillInfo", () => {
  it("returns null when skill cannot be loaded", () => {
    mockExistsSync.mockReturnValue(false);
    expect(loadSkillInfo("/some/dir")).toBeNull();
  });

  it("returns skill info with relative path from basePath", () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(
      "---\nname: my-skill\ndescription: A test\nlicense: MIT\ncompatibility: claude\nmetadata:\n  key: value\n---\nContent"
    );

    const result = loadSkillInfo("/base/skills/my-skill", "/base");
    expect(result).not.toBeNull();
    expect(result!.name).toBe("my-skill");
    expect(result!.description).toBe("A test");
    expect(result!.path).toBe("/base/skills/my-skill");
    expect(result!.relativePath).toBe("skills/my-skill");
    expect(result!.license).toBe("MIT");
    expect(result!.compatibility).toBe("claude");
    expect(result!.metadata).toEqual({ key: "value" });
  });

  it("uses directory name as relative path when no basePath", () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue("---\nname: my-skill\ndescription: A test\n---\nContent");

    const result = loadSkillInfo("/base/skills/my-skill");
    expect(result).not.toBeNull();
    expect(result!.relativePath).toBe("my-skill");
  });
});

describe("discoverSkills", () => {
  it("returns skills found by findSkillDirs", () => {
    mockFindSkillDirs.mockReturnValue(["/base/skill-one", "/base/skill-two"]);

    // First call for skill-one
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync
      .mockReturnValueOnce("---\nname: skill-one\ndescription: First\n---\nContent1")
      .mockReturnValueOnce("---\nname: skill-two\ndescription: Second\n---\nContent2");

    const results = discoverSkills("/base");
    expect(results).toHaveLength(2);
    expect(results[0].name).toBe("skill-one");
    expect(results[1].name).toBe("skill-two");
  });

  it("skips directories that fail to load", () => {
    mockFindSkillDirs.mockReturnValue(["/base/good", "/base/bad"]);

    mockExistsSync
      .mockReturnValueOnce(true) // good SKILL.md exists
      .mockReturnValueOnce(false); // bad SKILL.md doesn't exist
    mockReadFileSync.mockReturnValueOnce("---\nname: good\ndescription: Good skill\n---\nContent");

    const results = discoverSkills("/base");
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe("good");
  });

  it("returns empty array when no skills found", () => {
    mockFindSkillDirs.mockReturnValue([]);

    const results = discoverSkills("/base");
    expect(results).toHaveLength(0);
  });
});

describe("findSkillByName", () => {
  it("finds a skill by name", () => {
    mockFindSkillDirs.mockReturnValue(["/base/skill-one", "/base/target"]);
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync
      .mockReturnValueOnce("---\nname: skill-one\ndescription: First\n---\nC1")
      .mockReturnValueOnce("---\nname: target\ndescription: Target\n---\nC2");

    const result = findSkillByName("/base", "target");
    expect(result).not.toBeNull();
    expect(result!.name).toBe("target");
  });

  it("returns null when skill not found", () => {
    mockFindSkillDirs.mockReturnValue(["/base/skill-one"]);
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue("---\nname: skill-one\ndescription: First\n---\nC1");

    expect(findSkillByName("/base", "nonexistent")).toBeNull();
  });
});

describe("extractSkillFromRepoPath", () => {
  it("returns specific skill path when skillPath is given and valid", () => {
    mockSafeJoinPath.mockReturnValue("/repo/skills/my-skill");
    mockExistsSync.mockReturnValue(true);

    const result = extractSkillFromRepoPath("/repo", "skills/my-skill");
    expect(result).toBe("/repo/skills/my-skill");
  });

  it("returns null when skillPath traversal is detected", () => {
    mockSafeJoinPath.mockReturnValue(null);

    const result = extractSkillFromRepoPath("/repo", "../../etc");
    expect(result).toBeNull();
  });

  it("returns null when skillPath has no SKILL.md", () => {
    mockSafeJoinPath.mockReturnValue("/repo/skills/no-skill");
    mockExistsSync.mockReturnValue(false);

    const result = extractSkillFromRepoPath("/repo", "skills/no-skill");
    expect(result).toBeNull();
  });

  it("returns skills directory when it exists and no skillPath", () => {
    // existsSync called for join(repoPath, "skills")
    mockExistsSync.mockReturnValueOnce(true);

    const result = extractSkillFromRepoPath("/repo");
    expect(result).toMatch(/skills$/);
  });

  it("returns repo root when it contains SKILL.md and no skills dir", () => {
    mockExistsSync
      .mockReturnValueOnce(false) // skills dir doesn't exist
      .mockReturnValueOnce(true); // SKILL.md at root exists

    const result = extractSkillFromRepoPath("/repo");
    expect(result).toBe("/repo");
  });

  it("returns null when no skills found in repo", () => {
    mockExistsSync.mockReturnValue(false);

    const result = extractSkillFromRepoPath("/repo");
    expect(result).toBeNull();
  });
});
