import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  parseGitUrl,
  isValidGitUrl,
  parseGitHubUrl,
  isValidGitHubUrl,
  safeJoinPath,
  isPathWithin,
  findSkillDirs,
} from "../utils/fs.js";

describe("parseGitUrl", () => {
  describe("HTTPS URLs", () => {
    it("parses https://github.com/owner/repo", () => {
      const result = parseGitUrl("https://github.com/anthropics/skills");
      expect(result).toEqual({
        host: "github.com",
        owner: "anthropics",
        repo: "skills",
        path: undefined,
        cloneUrl: "https://github.com/anthropics/skills.git",
      });
    });

    it("parses https://github.com/owner/repo.git", () => {
      const result = parseGitUrl("https://github.com/anthropics/skills.git");
      expect(result).toEqual({
        host: "github.com",
        owner: "anthropics",
        repo: "skills",
        path: undefined,
        cloneUrl: "https://github.com/anthropics/skills.git",
      });
    });

    it("parses https://github.com/owner/repo/tree/main/path", () => {
      const result = parseGitUrl("https://github.com/anthropics/skills/tree/main/skills/pdf");
      expect(result).toEqual({
        host: "github.com",
        owner: "anthropics",
        repo: "skills",
        path: "skills/pdf",
        cloneUrl: "https://github.com/anthropics/skills.git",
      });
    });

    it("parses https://gitlab.com/owner/repo", () => {
      const result = parseGitUrl("https://gitlab.com/user/project");
      expect(result).toEqual({
        host: "gitlab.com",
        owner: "user",
        repo: "project",
        path: undefined,
        cloneUrl: "https://gitlab.com/user/project.git",
      });
    });

    it("parses self-hosted Git URLs", () => {
      const result = parseGitUrl("https://git.company.com/team/repo");
      expect(result).toEqual({
        host: "git.company.com",
        owner: "team",
        repo: "repo",
        path: undefined,
        cloneUrl: "https://git.company.com/team/repo.git",
      });
    });
  });

  describe("SSH URLs", () => {
    it("parses git@github.com:owner/repo.git", () => {
      const result = parseGitUrl("git@github.com:anthropics/skills.git");
      expect(result).toEqual({
        host: "github.com",
        owner: "anthropics",
        repo: "skills",
        cloneUrl: "git@github.com:anthropics/skills.git",
      });
    });

    it("parses git@gitlab.com:owner/repo.git", () => {
      const result = parseGitUrl("git@gitlab.com:user/project.git");
      expect(result).toEqual({
        host: "gitlab.com",
        owner: "user",
        repo: "project",
        cloneUrl: "git@gitlab.com:user/project.git",
      });
    });

    it("parses SSH URL without .git extension", () => {
      const result = parseGitUrl("git@github.com:owner/repo");
      expect(result).toEqual({
        host: "github.com",
        owner: "owner",
        repo: "repo",
        cloneUrl: "git@github.com:owner/repo.git",
      });
    });
  });

  describe("Git protocol URLs", () => {
    it("parses git://host/owner/repo.git", () => {
      const result = parseGitUrl("git://example.com/owner/repo.git");
      expect(result).toEqual({
        host: "example.com",
        owner: "owner",
        repo: "repo",
        cloneUrl: "git://example.com/owner/repo.git",
      });
    });
  });

  describe("Shorthand formats", () => {
    it("parses github:owner/repo", () => {
      const result = parseGitUrl("github:anthropics/skills");
      expect(result).toEqual({
        host: "github.com",
        owner: "anthropics",
        repo: "skills",
        cloneUrl: "https://github.com/anthropics/skills.git",
      });
    });

    it("parses owner/repo (assumes GitHub)", () => {
      const result = parseGitUrl("anthropics/skills");
      expect(result).toEqual({
        host: "github.com",
        owner: "anthropics",
        repo: "skills",
        cloneUrl: "https://github.com/anthropics/skills.git",
      });
    });
  });

  describe("Invalid URLs", () => {
    it("returns null for invalid URLs", () => {
      expect(parseGitUrl("not-a-url")).toBeNull();
      expect(parseGitUrl("")).toBeNull();
      expect(parseGitUrl("just-a-word")).toBeNull();
    });

    it("rejects URLs with control characters", () => {
      expect(parseGitUrl("https://github.com/owner/repo\n")).toBeNull();
      expect(parseGitUrl("https://github.com/owner\x00/repo")).toBeNull();
    });

    it("rejects invalid owner/repo names", () => {
      expect(parseGitUrl("https://github.com/../repo")).toBeNull();
      expect(parseGitUrl("https://github.com/owner/..")).toBeNull();
      expect(parseGitUrl("../evil")).toBeNull();
    });
  });
});

describe("isValidGitUrl", () => {
  it("returns true for valid Git URLs", () => {
    expect(isValidGitUrl("https://github.com/anthropics/skills")).toBe(true);
    expect(isValidGitUrl("https://gitlab.com/user/repo")).toBe(true);
    expect(isValidGitUrl("git@github.com:owner/repo.git")).toBe(true);
    expect(isValidGitUrl("owner/repo")).toBe(true);
    expect(isValidGitUrl("github:owner/repo")).toBe(true);
  });

  it("returns false for invalid URLs", () => {
    expect(isValidGitUrl("not-valid")).toBe(false);
    expect(isValidGitUrl("")).toBe(false);
  });
});

// Legacy function tests (deprecated but still exported for compatibility)
describe("parseGitHubUrl (legacy)", () => {
  it("parses GitHub URLs", () => {
    const result = parseGitHubUrl("https://github.com/anthropics/skills");
    expect(result).toEqual({ owner: "anthropics", repo: "skills", path: undefined });
  });

  it("parses owner/repo", () => {
    const result = parseGitHubUrl("anthropics/skills");
    expect(result).toEqual({ owner: "anthropics", repo: "skills" });
  });

  it("returns null for non-GitHub URLs", () => {
    // parseGitHubUrl only accepts GitHub URLs
    expect(parseGitHubUrl("https://gitlab.com/owner/repo")).toBeNull();
  });
});

describe("isValidGitHubUrl (legacy)", () => {
  it("returns true for valid GitHub URLs", () => {
    expect(isValidGitHubUrl("https://github.com/anthropics/skills")).toBe(true);
    expect(isValidGitHubUrl("owner/repo")).toBe(true);
    expect(isValidGitHubUrl("github:owner/repo")).toBe(true);
  });

  it("returns false for non-GitHub URLs", () => {
    expect(isValidGitHubUrl("not-valid")).toBe(false);
    expect(isValidGitHubUrl("https://gitlab.com/owner/repo")).toBe(false);
  });
});

describe("safeJoinPath", () => {
  it("joins paths within base directory", () => {
    expect(safeJoinPath("/base", "subdir")).toBe("/base/subdir");
    expect(safeJoinPath("/base", "a/b/c")).toBe("/base/a/b/c");
  });

  it("returns null for path traversal attempts", () => {
    expect(safeJoinPath("/base", "../outside")).toBeNull();
    expect(safeJoinPath("/base", "subdir/../../outside")).toBeNull();
  });

  it("handles paths starting with slash (path.join normalizes them)", () => {
    // Note: path.join("/base", "/absolute") = "/base/absolute" on POSIX
    // This is within the base, so it's valid
    expect(safeJoinPath("/base", "/subdir")).toBe("/base/subdir");
  });
});

describe("isPathWithin", () => {
  it("returns true for paths within base", () => {
    expect(isPathWithin("/base", "/base/subdir")).toBe(true);
    expect(isPathWithin("/base", "/base")).toBe(true);
  });

  it("returns false for paths outside base", () => {
    expect(isPathWithin("/base", "/other")).toBe(false);
    expect(isPathWithin("/base", "/base/../other")).toBe(false);
  });
});

describe("findSkillDirs", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `osk-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("returns empty array for non-existent path", () => {
    expect(findSkillDirs("/non/existent/path")).toEqual([]);
  });

  it("returns empty array for empty directory", () => {
    expect(findSkillDirs(testDir)).toEqual([]);
  });

  it("finds skills in top-level directories", () => {
    // Create skill-one/SKILL.md
    const skill1 = join(testDir, "skill-one");
    mkdirSync(skill1);
    writeFileSync(join(skill1, "SKILL.md"), "---\nname: skill-one\n---");

    // Create skill-two/SKILL.md
    const skill2 = join(testDir, "skill-two");
    mkdirSync(skill2);
    writeFileSync(join(skill2, "SKILL.md"), "---\nname: skill-two\n---");

    const results = findSkillDirs(testDir);
    expect(results).toHaveLength(2);
    expect(results).toContain(skill1);
    expect(results).toContain(skill2);
  });

  it("finds skills in nested directories (recursive)", () => {
    // Create .curated/my-skill/SKILL.md
    const curated = join(testDir, ".curated");
    const curatedSkill = join(curated, "my-skill");
    mkdirSync(curatedSkill, { recursive: true });
    writeFileSync(join(curatedSkill, "SKILL.md"), "---\nname: my-skill\n---");

    // Create .experimental/another-skill/SKILL.md
    const experimental = join(testDir, ".experimental");
    const expSkill = join(experimental, "another-skill");
    mkdirSync(expSkill, { recursive: true });
    writeFileSync(join(expSkill, "SKILL.md"), "---\nname: another-skill\n---");

    const results = findSkillDirs(testDir);
    expect(results).toHaveLength(2);
    expect(results).toContain(curatedSkill);
    expect(results).toContain(expSkill);
  });

  it("finds skills at multiple nesting levels", () => {
    // Create skills/category/subcategory/deep-skill/SKILL.md
    const deepSkill = join(testDir, "skills", "category", "subcategory", "deep-skill");
    mkdirSync(deepSkill, { recursive: true });
    writeFileSync(join(deepSkill, "SKILL.md"), "---\nname: deep-skill\n---");

    // Create root-skill/SKILL.md
    const rootSkill = join(testDir, "root-skill");
    mkdirSync(rootSkill);
    writeFileSync(join(rootSkill, "SKILL.md"), "---\nname: root-skill\n---");

    const results = findSkillDirs(testDir);
    expect(results).toHaveLength(2);
    expect(results).toContain(deepSkill);
    expect(results).toContain(rootSkill);
  });

  it("skips common non-skill directories", () => {
    // Create .git/config (should be skipped)
    const gitDir = join(testDir, ".git");
    mkdirSync(gitDir);
    writeFileSync(join(gitDir, "SKILL.md"), "---\nname: fake\n---");

    // Create node_modules/pkg/SKILL.md (should be skipped)
    const nodeModules = join(testDir, "node_modules", "pkg");
    mkdirSync(nodeModules, { recursive: true });
    writeFileSync(join(nodeModules, "SKILL.md"), "---\nname: fake\n---");

    // Create real-skill/SKILL.md (should be found)
    const realSkill = join(testDir, "real-skill");
    mkdirSync(realSkill);
    writeFileSync(join(realSkill, "SKILL.md"), "---\nname: real-skill\n---");

    const results = findSkillDirs(testDir);
    expect(results).toHaveLength(1);
    expect(results).toContain(realSkill);
  });

  it("does not recurse into skill directories", () => {
    // Create skill-with-nested/SKILL.md
    const skillDir = join(testDir, "skill-with-nested");
    mkdirSync(skillDir);
    writeFileSync(join(skillDir, "SKILL.md"), "---\nname: skill-with-nested\n---");

    // Create skill-with-nested/nested/SKILL.md (should NOT be found)
    const nestedDir = join(skillDir, "nested");
    mkdirSync(nestedDir);
    writeFileSync(join(nestedDir, "SKILL.md"), "---\nname: nested\n---");

    const results = findSkillDirs(testDir);
    expect(results).toHaveLength(1);
    expect(results).toContain(skillDir);
  });

  it("respects maxDepth parameter", () => {
    // Create deeply nested skill
    const deepPath = join(testDir, "a", "b", "c", "d", "e", "deep-skill");
    mkdirSync(deepPath, { recursive: true });
    writeFileSync(join(deepPath, "SKILL.md"), "---\nname: deep-skill\n---");

    // With maxDepth=3, should not find skill at depth 6
    const shallow = findSkillDirs(testDir, 3);
    expect(shallow).toHaveLength(0);

    // With maxDepth=10 (default), should find it
    const deep = findSkillDirs(testDir, 10);
    expect(deep).toHaveLength(1);
    expect(deep).toContain(deepPath);
  });
});
