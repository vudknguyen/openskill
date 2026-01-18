import { describe, it, expect, vi, beforeEach } from "vitest";
import { join } from "path";

// Mock the fs module
vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  return {
    ...actual,
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
  };
});

// Mock os.homedir
vi.mock("os", () => ({
  homedir: () => "/mock/home",
}));

import {
  getConfigDir,
  getConfigPath,
  getSkillsCacheDir,
  getReposCacheDir,
  loadConfig,
  saveConfig,
  addRepo,
  removeRepo,
  CONFIG_VERSION,
} from "../core/config.js";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";

const mockedExistsSync = vi.mocked(existsSync);
const mockedReadFileSync = vi.mocked(readFileSync);
const mockedWriteFileSync = vi.mocked(writeFileSync);
const _mockedMkdirSync = vi.mocked(mkdirSync);

describe("config paths", () => {
  it("returns correct config directory", () => {
    expect(getConfigDir()).toBe(join("/mock/home", ".openskill"));
  });

  it("returns correct config file path", () => {
    expect(getConfigPath()).toBe(join("/mock/home", ".openskill", "config.json"));
  });

  it("returns correct skills cache directory", () => {
    expect(getSkillsCacheDir()).toBe(join("/mock/home", ".openskill", "skills"));
  });

  it("returns correct repos cache directory", () => {
    expect(getReposCacheDir()).toBe(join("/mock/home", ".openskill", "repos"));
  });

  it("exports CONFIG_VERSION constant", () => {
    expect(typeof CONFIG_VERSION).toBe("number");
    expect(CONFIG_VERSION).toBeGreaterThan(0);
  });
});

describe("loadConfig", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates default config when file does not exist", () => {
    mockedExistsSync.mockReturnValue(false);

    const config = loadConfig();

    expect(config.defaultAgent).toBe("claude");
    expect(config.defaultScope).toBe("project");
    expect(config.repos.length).toBeGreaterThan(0);
    expect(mockedWriteFileSync).toHaveBeenCalled();
  });

  it("loads existing config file", () => {
    const existingConfig = {
      defaultAgent: "cursor",
      defaultScope: "global",
      repos: [{ name: "test-repo", url: "https://github.com/test/skills" }],
      agents: {
        claude: { skillPath: ".claude/skills" },
        cursor: { skillPath: ".cursor/skills" },
      },
    };

    mockedExistsSync.mockImplementation((path) => {
      if (typeof path === "string" && path.endsWith("config.json")) return true;
      return false;
    });
    mockedReadFileSync.mockReturnValue(JSON.stringify(existingConfig));

    const config = loadConfig();

    expect(config.defaultAgent).toBe("cursor");
    expect(config.defaultScope).toBe("global");
    expect(config.repos).toEqual([{ name: "test-repo", url: "https://github.com/test/skills" }]);
  });

  it("handles corrupted config file by resetting to defaults", () => {
    mockedExistsSync.mockImplementation((path) => {
      if (typeof path === "string" && path.endsWith("config.json")) return true;
      return false;
    });
    mockedReadFileSync.mockReturnValue("not valid json {{{");

    const config = loadConfig();

    expect(config.defaultAgent).toBe("claude");
    expect(config.defaultScope).toBe("project");
    expect(mockedWriteFileSync).toHaveBeenCalled();
  });

  it("migrates old registries field to repos", () => {
    const oldConfig = {
      defaultAgent: "claude",
      defaultScope: "project",
      registries: [{ name: "old-repo", url: "https://github.com/old/skills" }],
      agents: {
        claude: { skillPath: ".claude/skills" },
      },
    };

    mockedExistsSync.mockImplementation((path) => {
      if (typeof path === "string" && path.endsWith("config.json")) return true;
      return false;
    });
    mockedReadFileSync.mockReturnValue(JSON.stringify(oldConfig));

    const config = loadConfig();

    expect(config.repos).toEqual([{ name: "old-repo", url: "https://github.com/old/skills" }]);
    // Should save migrated config
    expect(mockedWriteFileSync).toHaveBeenCalled();
  });

  it("migrates old cursor path from .cursor/rules to .cursor/skills", () => {
    const oldConfig = {
      defaultAgent: "claude",
      defaultScope: "project",
      repos: [],
      agents: {
        cursor: { skillPath: ".cursor/rules" },
      },
    };

    mockedExistsSync.mockImplementation((path) => {
      if (typeof path === "string" && path.endsWith("config.json")) return true;
      return false;
    });
    mockedReadFileSync.mockReturnValue(JSON.stringify(oldConfig));

    const config = loadConfig();

    expect(config.agents.cursor.skillPath).toBe(".cursor/skills");
    expect(mockedWriteFileSync).toHaveBeenCalled();
  });

  it("validates and falls back on invalid defaultScope", () => {
    const badConfig = {
      defaultAgent: "claude",
      defaultScope: "invalid-scope",
      repos: [],
      agents: {},
    };

    mockedExistsSync.mockImplementation((path) => {
      if (typeof path === "string" && path.endsWith("config.json")) return true;
      return false;
    });
    mockedReadFileSync.mockReturnValue(JSON.stringify(badConfig));

    const config = loadConfig();

    expect(config.defaultScope).toBe("project");
  });

  it("filters invalid repos from config", () => {
    const badConfig = {
      defaultAgent: "claude",
      defaultScope: "project",
      repos: [
        { name: "valid", url: "https://github.com/test/skills" },
        { name: 123, url: "bad" }, // invalid
        { name: "no-url" }, // missing url
        null,
        "not-an-object",
      ],
      agents: {},
    };

    mockedExistsSync.mockImplementation((path) => {
      if (typeof path === "string" && path.endsWith("config.json")) return true;
      return false;
    });
    mockedReadFileSync.mockReturnValue(JSON.stringify(badConfig));

    const config = loadConfig();

    expect(config.repos).toEqual([{ name: "valid", url: "https://github.com/test/skills" }]);
  });

  it("includes version field in loaded config", () => {
    mockedExistsSync.mockReturnValue(false);

    const config = loadConfig();

    expect(config.version).toBe(CONFIG_VERSION);
  });

  it("migrates config without version to latest version", () => {
    const oldConfig = {
      defaultAgent: "claude",
      defaultScope: "project",
      repos: [],
      agents: {},
      // no version field - treated as version 0
    };

    mockedExistsSync.mockImplementation((path) => {
      if (typeof path === "string" && path.endsWith("config.json")) return true;
      return false;
    });
    mockedReadFileSync.mockReturnValue(JSON.stringify(oldConfig));

    const config = loadConfig();

    expect(config.version).toBe(CONFIG_VERSION);
    // Should save migrated config
    expect(mockedWriteFileSync).toHaveBeenCalled();
  });

  it("migrates old cursor path during version migration", () => {
    const oldConfig = {
      defaultAgent: "claude",
      defaultScope: "project",
      repos: [],
      agents: {
        cursor: { skillPath: ".cursor/rules" },
      },
      // no version field - triggers migration
    };

    mockedExistsSync.mockImplementation((path) => {
      if (typeof path === "string" && path.endsWith("config.json")) return true;
      return false;
    });
    mockedReadFileSync.mockReturnValue(JSON.stringify(oldConfig));

    const config = loadConfig();

    expect(config.agents.cursor.skillPath).toBe(".cursor/skills");
    expect(config.version).toBe(CONFIG_VERSION);
  });

  it("does not re-migrate already migrated config", () => {
    const currentConfig = {
      version: CONFIG_VERSION,
      defaultAgent: "claude",
      defaultScope: "project",
      repos: [],
      agents: {},
    };

    mockedExistsSync.mockImplementation((path) => {
      if (typeof path === "string" && path.endsWith("config.json")) return true;
      return false;
    });
    mockedReadFileSync.mockReturnValue(JSON.stringify(currentConfig));

    loadConfig();

    // Should NOT save if already at current version
    expect(mockedWriteFileSync).not.toHaveBeenCalled();
  });
});

describe("saveConfig", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedExistsSync.mockReturnValue(true);
  });

  it("saves config as formatted JSON", () => {
    const config = {
      version: CONFIG_VERSION,
      defaultAgent: "claude",
      defaultScope: "project" as const,
      repos: [],
      agents: {},
    };

    saveConfig(config);

    expect(mockedWriteFileSync).toHaveBeenCalledWith(
      expect.stringContaining("config.json"),
      expect.stringContaining('"defaultAgent": "claude"'),
      "utf-8"
    );
  });

  it("saves config with version field", () => {
    const config = {
      version: CONFIG_VERSION,
      defaultAgent: "claude",
      defaultScope: "project" as const,
      repos: [],
      agents: {},
    };

    saveConfig(config);

    const savedContent = mockedWriteFileSync.mock.calls.at(-1)?.[1] as string;
    const savedConfig = JSON.parse(savedContent);
    expect(savedConfig.version).toBe(CONFIG_VERSION);
  });
});

describe("addRepo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(
      JSON.stringify({
        defaultAgent: "claude",
        defaultScope: "project",
        repos: [],
        agents: {},
      })
    );
  });

  it("adds a new repository", () => {
    addRepo("my-repo", "https://github.com/owner/skills");

    expect(mockedWriteFileSync).toHaveBeenCalled();
    const savedConfig = JSON.parse(mockedWriteFileSync.mock.calls.at(-1)?.[1] as string);
    expect(savedConfig.repos).toContainEqual({
      name: "my-repo",
      url: "https://github.com/owner/skills",
    });
  });

  it("updates existing repository URL", () => {
    mockedReadFileSync.mockReturnValue(
      JSON.stringify({
        defaultAgent: "claude",
        defaultScope: "project",
        repos: [{ name: "existing", url: "https://github.com/old/url" }],
        agents: {},
      })
    );

    addRepo("existing", "https://github.com/new/url");

    const savedConfig = JSON.parse(mockedWriteFileSync.mock.calls.at(-1)?.[1] as string);
    expect(savedConfig.repos).toContainEqual({
      name: "existing",
      url: "https://github.com/new/url",
    });
    expect(savedConfig.repos.length).toBe(1);
  });

  it("throws on invalid repository name", () => {
    expect(() => addRepo("", "https://github.com/test/skills")).toThrow("Invalid repository name");

    expect(() => addRepo("bad name with spaces", "https://github.com/test/skills")).toThrow(
      "Invalid repository name"
    );

    expect(() => addRepo("bad/name", "https://github.com/test/skills")).toThrow(
      "Invalid repository name"
    );

    expect(() => addRepo("a".repeat(101), "https://github.com/test/skills")).toThrow(
      "Invalid repository name"
    );
  });

  it("accepts valid repository names", () => {
    expect(() => addRepo("valid-name", "https://github.com/test/skills")).not.toThrow();
    expect(() => addRepo("valid_name", "https://github.com/test/skills")).not.toThrow();
    expect(() => addRepo("ValidName123", "https://github.com/test/skills")).not.toThrow();
  });

  it("throws on invalid URL", () => {
    expect(() => addRepo("valid-name", "not-a-url")).toThrow("Invalid repository URL");

    expect(() => addRepo("valid-name", "ftp://example.com/repo")).toThrow("Invalid repository URL");

    expect(() => addRepo("valid-name", "")).toThrow("Invalid repository URL");
  });

  it("accepts various Git URL formats", () => {
    // HTTPS URLs
    expect(() => addRepo("github-test", "https://github.com/test/skills")).not.toThrow();
    expect(() => addRepo("gitlab-test", "https://gitlab.com/test/skills")).not.toThrow();

    // SSH URLs
    expect(() => addRepo("ssh-test", "git@github.com:test/skills.git")).not.toThrow();

    // owner/repo shorthand
    expect(() => addRepo("shorthand-test", "test/skills")).not.toThrow();
  });
});

describe("removeRepo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedExistsSync.mockReturnValue(true);
  });

  it("removes an existing repository", () => {
    mockedReadFileSync.mockReturnValue(
      JSON.stringify({
        defaultAgent: "claude",
        defaultScope: "project",
        repos: [
          { name: "repo-1", url: "https://github.com/test/1" },
          { name: "repo-2", url: "https://github.com/test/2" },
        ],
        agents: {},
      })
    );

    const result = removeRepo("repo-1");

    expect(result).toBe(true);
    const savedConfig = JSON.parse(mockedWriteFileSync.mock.calls.at(-1)?.[1] as string);
    expect(savedConfig.repos).toEqual([{ name: "repo-2", url: "https://github.com/test/2" }]);
  });

  it("returns false when repository does not exist", () => {
    mockedReadFileSync.mockReturnValue(
      JSON.stringify({
        defaultAgent: "claude",
        defaultScope: "project",
        repos: [{ name: "existing", url: "https://github.com/test/1" }],
        agents: {},
      })
    );

    const result = removeRepo("non-existent");

    expect(result).toBe(false);
  });
});
