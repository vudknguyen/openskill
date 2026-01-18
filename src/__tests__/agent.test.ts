import { describe, it, expect, vi, beforeEach } from "vitest";
import { join } from "path";

// Mock the fs module
vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  return {
    ...actual,
    existsSync: vi.fn(),
    cpSync: vi.fn(),
    rmSync: vi.fn(),
    readFileSync: vi.fn(),
    lstatSync: vi.fn(),
    mkdirSync: vi.fn(),
    readdirSync: vi.fn(),
    statSync: vi.fn(),
  };
});

// Mock os.homedir
vi.mock("os", () => ({
  homedir: () => "/mock/home",
}));

// Mock config
vi.mock("../core/config.js", () => ({
  loadConfig: () => ({
    defaultAgent: "claude",
    defaultScope: "project",
    repos: [],
    agents: {
      claude: { skillPath: ".claude/skills" },
      cursor: { skillPath: ".cursor/skills" },
    },
  }),
}));

// Mock fs utilities
vi.mock("../utils/fs.js", () => ({
  ensureDir: vi.fn(),
  findSkillDirs: vi.fn(() => []),
  getProjectRoot: () => "/mock/project",
  safeJoinPath: (base: string, name: string) => {
    if (!name || name.includes("..") || name.includes("/")) return null;
    return join(base, name);
  },
}));

// Mock skill validation
vi.mock("../core/skill.js", () => ({
  validateSkillName: (name: string) => {
    if (!name || typeof name !== "string") return { valid: false, error: "Name is required" };
    if (name.length > 50) return { valid: false, error: "Name too long" };
    return { valid: true };
  },
  validateSkillDescription: (desc: string) => {
    if (!desc || typeof desc !== "string")
      return { valid: false, error: "Description is required" };
    return { valid: true };
  },
}));

import { BaseAgent, type AgentConfig } from "../agents/base.js";
import { existsSync, cpSync, rmSync, readFileSync, lstatSync, readdirSync, statSync } from "fs";
import { findSkillDirs } from "../utils/fs.js";
import type { ParsedSkill } from "../utils/markdown.js";

const mockedExistsSync = vi.mocked(existsSync);
const mockedCpSync = vi.mocked(cpSync);
const mockedRmSync = vi.mocked(rmSync);
const mockedReadFileSync = vi.mocked(readFileSync);
const mockedLstatSync = vi.mocked(lstatSync);
const mockedFindSkillDirs = vi.mocked(findSkillDirs);
const _mockedReaddirSync = vi.mocked(readdirSync);
const _mockedStatSync = vi.mocked(statSync);

const testAgentConfig: AgentConfig = {
  name: "test-agent",
  displayName: "Test Agent",
  icon: "🧪",
  color: "\x1b[35m",
  defaultSkillPath: ".test-agent/skills",
  globalDirName: ".test-agent",
};

describe("BaseAgent", () => {
  let agent: BaseAgent;

  beforeEach(() => {
    vi.clearAllMocks();
    agent = new BaseAgent(testAgentConfig);
  });

  describe("constructor", () => {
    it("sets agent properties from config", () => {
      expect(agent.name).toBe("test-agent");
      expect(agent.displayName).toBe("Test Agent");
      expect(agent.icon).toBe("🧪");
      expect(agent.format).toBe("skill.md");
    });
  });

  describe("getSkillPath", () => {
    it("returns default skill path for project", () => {
      const path = agent.getSkillPath();
      expect(path).toBe(join("/mock/project", ".test-agent/skills"));
    });

    it("uses custom project directory", () => {
      const path = agent.getSkillPath("/custom/project");
      expect(path).toBe(join("/custom/project", ".test-agent/skills"));
    });
  });

  describe("getGlobalSkillPath", () => {
    it("returns global skill path in home directory", () => {
      const path = agent.getGlobalSkillPath();
      expect(path).toBe(join("/mock/home", ".test-agent", "skills"));
    });
  });

  describe("listSkills", () => {
    it("returns empty array when no skills installed", async () => {
      mockedFindSkillDirs.mockReturnValue([]);

      const skills = await agent.listSkills();

      expect(skills).toEqual([]);
    });

    it("lists skills from project directory", async () => {
      const skillDir = "/mock/project/.test-agent/skills/my-skill";
      mockedFindSkillDirs.mockReturnValue([skillDir]);
      mockedExistsSync.mockReturnValue(true);
      mockedReadFileSync.mockReturnValue(`---
name: my-skill
description: A test skill
---
Content`);

      const skills = await agent.listSkills(undefined, "project");

      expect(skills.length).toBe(1);
      expect(skills[0].name).toBe("my-skill");
      expect(skills[0].source).toBe("project");
    });

    it("lists skills from global directory", async () => {
      const skillDir = "/mock/home/.test-agent/skills/global-skill";
      mockedFindSkillDirs.mockReturnValue([skillDir]);
      mockedExistsSync.mockReturnValue(true);
      mockedReadFileSync.mockReturnValue(`---
name: global-skill
description: A global skill
---
Content`);

      const skills = await agent.listSkills(undefined, "global");

      expect(skills.length).toBe(1);
      expect(skills[0].name).toBe("global-skill");
      expect(skills[0].source).toBe("global");
    });

    it("skips invalid skills silently", async () => {
      const skillDir = "/mock/project/.test-agent/skills/invalid";
      mockedFindSkillDirs.mockReturnValue([skillDir]);
      mockedExistsSync.mockReturnValue(true);
      mockedReadFileSync.mockReturnValue("invalid yaml {{");

      const skills = await agent.listSkills();

      expect(skills).toEqual([]);
    });
  });

  describe("installSkill", () => {
    const mockSkill: ParsedSkill = {
      frontmatter: {
        name: "test-skill",
        description: "A test skill",
      },
      content: "Content",
      raw: "---\nname: test-skill\ndescription: A test skill\n---\nContent",
    };

    it("copies skill to target directory", async () => {
      mockedLstatSync.mockReturnValue({
        isSymbolicLink: () => false,
        isDirectory: () => true,
      } as ReturnType<typeof lstatSync>);

      await agent.installSkill(mockSkill, "/source/skill-dir");

      expect(mockedCpSync).toHaveBeenCalledWith(
        "/source/skill-dir",
        expect.stringContaining("test-skill"),
        expect.objectContaining({ recursive: true, dereference: true })
      );
    });

    it("removes existing skill before installing", async () => {
      mockedLstatSync.mockReturnValue({
        isSymbolicLink: () => false,
        isDirectory: () => true,
      } as ReturnType<typeof lstatSync>);

      await agent.installSkill(mockSkill, "/source/skill-dir");

      expect(mockedRmSync).toHaveBeenCalledWith(
        expect.stringContaining("test-skill"),
        expect.objectContaining({ recursive: true, force: true })
      );
    });

    it("installs to global directory when scope is global", async () => {
      mockedLstatSync.mockReturnValue({
        isSymbolicLink: () => false,
        isDirectory: () => true,
      } as ReturnType<typeof lstatSync>);

      await agent.installSkill(mockSkill, "/source/skill-dir", undefined, "global");

      expect(mockedCpSync).toHaveBeenCalledWith(
        "/source/skill-dir",
        expect.stringContaining(join("/mock/home", ".test-agent", "skills", "test-skill")),
        expect.any(Object)
      );
    });

    it("throws error for symlink skill directory", async () => {
      mockedLstatSync.mockReturnValue({
        isSymbolicLink: () => true,
      } as ReturnType<typeof lstatSync>);

      await expect(agent.installSkill(mockSkill, "/source/symlink-dir")).rejects.toThrow(
        "cannot be a symlink"
      );
    });

    it("throws error for non-existent skill directory", async () => {
      const error = new Error("ENOENT") as NodeJS.ErrnoException;
      error.code = "ENOENT";
      mockedLstatSync.mockImplementation(() => {
        throw error;
      });

      await expect(agent.installSkill(mockSkill, "/nonexistent/dir")).rejects.toThrow("not found");
    });

    it("throws error for invalid skill name", async () => {
      mockedLstatSync.mockReturnValue({
        isSymbolicLink: () => false,
        isDirectory: () => true,
      } as ReturnType<typeof lstatSync>);

      const badSkill: ParsedSkill = {
        frontmatter: {
          name: "../traversal",
          description: "Bad skill",
        },
        content: "",
        raw: "",
      };

      await expect(agent.installSkill(badSkill, "/source/dir")).rejects.toThrow(
        "Invalid skill name"
      );
    });
  });

  describe("uninstallSkill", () => {
    it("removes skill directory and returns true", async () => {
      mockedExistsSync.mockReturnValue(true);

      const result = await agent.uninstallSkill("test-skill");

      expect(result).toBe(true);
      expect(mockedRmSync).toHaveBeenCalledWith(
        expect.stringContaining("test-skill"),
        expect.objectContaining({ recursive: true, force: true })
      );
    });

    it("returns false when skill does not exist", async () => {
      mockedExistsSync.mockReturnValue(false);

      const result = await agent.uninstallSkill("nonexistent");

      expect(result).toBe(false);
      expect(mockedRmSync).not.toHaveBeenCalled();
    });

    it("uninstalls from global directory when scope is global", async () => {
      mockedExistsSync.mockReturnValue(true);

      await agent.uninstallSkill("test-skill", undefined, "global");

      expect(mockedRmSync).toHaveBeenCalledWith(
        expect.stringContaining(join("/mock/home", ".test-agent", "skills", "test-skill")),
        expect.any(Object)
      );
    });
  });

  describe("validateSkill", () => {
    it("returns valid for well-formed skill", () => {
      const skill: ParsedSkill = {
        frontmatter: {
          name: "valid-skill",
          description: "A valid description",
        },
        content: "Content",
        raw: "",
      };

      const result = agent.validateSkill(skill);

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it("returns errors for missing name", () => {
      const skill: ParsedSkill = {
        frontmatter: {
          name: "",
          description: "Description",
        },
        content: "",
        raw: "",
      };

      const result = agent.validateSkill(skill);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("name"))).toBe(true);
    });

    it("returns errors for missing description", () => {
      const skill: ParsedSkill = {
        frontmatter: {
          name: "valid-name",
          description: "",
        },
        content: "",
        raw: "",
      };

      const result = agent.validateSkill(skill);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("description"))).toBe(true);
    });

    it("returns multiple errors when both name and description invalid", () => {
      const skill: ParsedSkill = {
        frontmatter: {
          name: "",
          description: "",
        },
        content: "",
        raw: "",
      };

      const result = agent.validateSkill(skill);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBe(2);
    });
  });
});
