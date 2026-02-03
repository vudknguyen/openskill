import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock auth module
vi.mock("../core/auth.js", () => ({
  loadAuth: vi.fn(),
}));

// Mock config module
vi.mock("../core/config.js", () => ({
  loadConfig: vi.fn(),
}));

// Mock skill module
vi.mock("../core/skill.js", () => ({
  loadSkillFromDir: vi.fn(),
}));

// Mock manifest module
vi.mock("../core/manifest.js", () => ({
  addSkillRecord: vi.fn(),
}));

// Mock agents module
vi.mock("../agents/index.js", () => ({
  getAgent: vi.fn(),
}));

// Mock logger
vi.mock("../utils/logger.js", () => ({
  logger: { success: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  createSpinner: vi.fn(() => ({
    stop: vi.fn(),
    update: vi.fn(),
  })),
}));

// Mock url utilities
vi.mock("../utils/url.js", () => ({
  validateServerUrl: vi.fn((url: string) => url),
  skillApiPath: vi.fn((slug: string, ...segments: string[]) => {
    const suffix = segments.length > 0 ? `/${segments.join("/")}` : "";
    return `/api/skills/${slug}${suffix}`;
  }),
}));

// Mock fs
vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  return {
    ...actual,
    mkdirSync: vi.fn(),
    existsSync: vi.fn(),
    writeFileSync: vi.fn(),
    readFileSync: vi.fn(),
    rmSync: vi.fn(),
  };
});

// Mock os
vi.mock("os", () => ({
  tmpdir: () => "/mock/tmp",
}));

// Mock tar
vi.mock("tar", () => ({
  extract: vi.fn().mockResolvedValue(undefined),
}));

import { loadAuth } from "../core/auth.js";
import { loadConfig } from "../core/config.js";
import { loadSkillFromDir } from "../core/skill.js";
import { addSkillRecord } from "../core/manifest.js";
import { getAgent } from "../agents/index.js";
import { rmSync } from "fs";
import {
  fetchMarketplaceSkill,
  installFromMarketplace,
} from "../core/marketplace-installer.js";

const mockLoadAuth = vi.mocked(loadAuth);
const mockLoadConfig = vi.mocked(loadConfig);
const mockLoadSkillFromDir = vi.mocked(loadSkillFromDir);
const mockAddSkillRecord = vi.mocked(addSkillRecord);
const mockGetAgent = vi.mocked(getAgent);
const mockRmSync = vi.mocked(rmSync);

beforeEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("fetchMarketplaceSkill", () => {
  it("fetches metadata from the marketplace API", async () => {
    const metadata = {
      downloadUrl: "https://cdn.example.com/skill.tar.gz",
      version: "1.0.0",
      fileHash: "abc123",
      fileSize: 4096,
    };

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(metadata),
      }),
    );

    const result = await fetchMarketplaceSkill("https://example.com", "my-skill");

    expect(result).toEqual(metadata);
    expect(fetch).toHaveBeenCalledWith(
      "https://example.com/api/skills/my-skill/download",
      expect.objectContaining({ headers: expect.any(Object) }),
    );
  });

  it("includes version query parameter when provided", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ downloadUrl: "", version: "2.0.0", fileHash: null, fileSize: null }),
      }),
    );

    await fetchMarketplaceSkill("https://example.com", "my-skill", "2.0.0");

    expect(fetch).toHaveBeenCalledWith(
      "https://example.com/api/skills/my-skill/download?version=2.0.0",
      expect.objectContaining({ headers: expect.any(Object) }),
    );
  });

  it("throws with server error message when response is not ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ error: "Skill not found" }),
      }),
    );

    await expect(
      fetchMarketplaceSkill("https://example.com", "nonexistent"),
    ).rejects.toThrow("Skill not found");
  });

  it("throws with status code when error body has no message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve({}),
      }),
    );

    await expect(
      fetchMarketplaceSkill("https://example.com", "my-skill"),
    ).rejects.toThrow("Server returned 500");
  });

  it("throws with status code when JSON parsing of error body fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        json: () => Promise.reject(new Error("Invalid JSON")),
      }),
    );

    await expect(
      fetchMarketplaceSkill("https://example.com", "my-skill"),
    ).rejects.toThrow("Server returned 502");
  });
});

describe("installFromMarketplace", () => {
  function setupMocks() {
    // Auth
    mockLoadAuth.mockReturnValue({
      accessToken: "test-token",
      refreshToken: "test-refresh",
      serverUrl: "https://marketplace.example.com",
      createdAt: new Date().toISOString(),
    });

    // Config
    mockLoadConfig.mockReturnValue({
      version: 3,
      defaultAgent: "claude",
      defaultScope: "project",
      serverUrl: "https://marketplace.example.com",
      repos: [],
      agents: {},
    });

    // Fetch metadata
    const metadata = {
      downloadUrl: "https://cdn.example.com/skill.tar.gz",
      version: "1.0.0",
      fileHash: "abc123hash",
      fileSize: 2048,
    };

    // Download
    const downloadArrayBuffer = new ArrayBuffer(8);
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(metadata),
        })
        .mockResolvedValueOnce({
          ok: true,
          arrayBuffer: () => Promise.resolve(downloadArrayBuffer),
        }),
    );

    // Skill loading
    mockLoadSkillFromDir.mockReturnValue({
      frontmatter: {
        name: "my-skill",
        description: "A test skill",
      },
      content: "Do something useful",
      raw: "---\nname: my-skill\n---\nDo something useful",
    });

    // Agent
    const mockAgent = {
      name: "claude",
      displayName: "Claude",
      icon: "C",
      color: "blue",
      format: "skill.md" as const,
      validateSkill: vi.fn().mockReturnValue({ valid: true, errors: [] }),
      installSkill: vi.fn().mockResolvedValue(undefined),
      uninstallSkill: vi.fn(),
      getSkillPath: vi.fn(),
      getGlobalSkillPath: vi.fn(),
      listSkills: vi.fn(),
    };
    mockGetAgent.mockReturnValue(mockAgent);

    return { metadata, mockAgent };
  }

  it("installs a skill from the marketplace successfully", async () => {
    const { mockAgent } = setupMocks();

    await installFromMarketplace("my-skill", {});

    // Verify agent install was called
    expect(mockAgent.installSkill).toHaveBeenCalled();
    // Verify manifest record was added
    expect(mockAddSkillRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "my-skill",
        agent: "claude",
        repoOwner: "marketplace",
        repoName: "my-skill",
        commitHash: "abc123hash",
        source: "marketplace",
        marketplaceSlug: "my-skill",
        marketplaceVersion: "1.0.0",
      }),
    );
  });

  it("uses specified agent instead of default", async () => {
    setupMocks();
    const cursorAgent = {
      name: "cursor",
      displayName: "Cursor",
      icon: "C",
      color: "purple",
      format: "skill.md" as const,
      validateSkill: vi.fn().mockReturnValue({ valid: true, errors: [] }),
      installSkill: vi.fn().mockResolvedValue(undefined),
      uninstallSkill: vi.fn(),
      getSkillPath: vi.fn(),
      getGlobalSkillPath: vi.fn(),
      listSkills: vi.fn(),
    };
    mockGetAgent.mockReturnValue(cursorAgent);

    await installFromMarketplace("my-skill", { agent: "cursor" });

    expect(mockGetAgent).toHaveBeenCalledWith("cursor");
    expect(cursorAgent.installSkill).toHaveBeenCalled();
    expect(mockAddSkillRecord).toHaveBeenCalledWith(
      expect.objectContaining({ agent: "cursor" }),
    );
  });

  it("uses specified scope", async () => {
    setupMocks();

    await installFromMarketplace("my-skill", { scope: "global" });

    expect(mockAddSkillRecord).toHaveBeenCalledWith(
      expect.objectContaining({ scope: "global" }),
    );
  });

  it("uses custom server URL from options", async () => {
    setupMocks();

    await installFromMarketplace("my-skill", { server: "https://custom.server.com" });

    // First fetch call should use custom server
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("https://custom.server.com"),
      expect.any(Object),
    );
  });

  it("throws when metadata fetch fails", async () => {
    mockLoadAuth.mockReturnValue(null);
    mockLoadConfig.mockReturnValue({
      version: 3,
      defaultAgent: "claude",
      defaultScope: "project",
      serverUrl: "https://example.com",
      repos: [],
      agents: {},
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ error: "Not found" }),
      }),
    );

    await expect(installFromMarketplace("nonexistent", {})).rejects.toThrow(
      "Failed to find 'nonexistent' on marketplace",
    );
  });

  it("throws when downloaded package has no valid SKILL.md", async () => {
    setupMocks();
    mockLoadSkillFromDir.mockReturnValue(null);

    await expect(installFromMarketplace("bad-skill", {})).rejects.toThrow(
      "Downloaded package does not contain a valid SKILL.md",
    );
  });

  it("throws when agent is unknown", async () => {
    setupMocks();
    mockGetAgent.mockReturnValue(undefined);

    await expect(
      installFromMarketplace("my-skill", { agent: "unknown-agent" }),
    ).rejects.toThrow("Unknown agent: unknown-agent");
  });

  it("throws when skill is not compatible with agent", async () => {
    setupMocks();
    const incompatibleAgent = {
      name: "claude",
      displayName: "Claude",
      icon: "C",
      color: "blue",
      format: "skill.md" as const,
      validateSkill: vi.fn().mockReturnValue({
        valid: false,
        errors: ["Missing required field"],
      }),
      installSkill: vi.fn(),
      uninstallSkill: vi.fn(),
      getSkillPath: vi.fn(),
      getGlobalSkillPath: vi.fn(),
      listSkills: vi.fn(),
    };
    mockGetAgent.mockReturnValue(incompatibleAgent);

    await expect(installFromMarketplace("my-skill", {})).rejects.toThrow(
      "not compatible with Claude",
    );
  });

  it("uses version hash as commitHash when fileHash is null", async () => {
    setupMocks();
    // Override fetch to return null fileHash
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              downloadUrl: "https://cdn.example.com/skill.tar.gz",
              version: "2.0.0",
              fileHash: null,
              fileSize: null,
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
        }),
    );

    await installFromMarketplace("my-skill", {});

    expect(mockAddSkillRecord).toHaveBeenCalledWith(
      expect.objectContaining({ commitHash: "2.0.0" }),
    );
  });

  it("cleans up temp directory even when install fails", async () => {
    setupMocks();
    mockLoadSkillFromDir.mockReturnValue(null); // Will cause error

    await expect(installFromMarketplace("my-skill", {})).rejects.toThrow();

    // rmSync should be called in the finally block
    expect(mockRmSync).toHaveBeenCalledWith(
      expect.stringContaining("/mock/tmp/osk-marketplace-my-skill-"),
      { recursive: true, force: true },
    );
  });

  it("cleans up temp directory on successful install", async () => {
    setupMocks();

    await installFromMarketplace("my-skill", {});

    expect(mockRmSync).toHaveBeenCalledWith(
      expect.stringContaining("/mock/tmp/osk-marketplace-my-skill-"),
      { recursive: true, force: true },
    );
  });

  it("throws when download fails with non-ok response", async () => {
    mockLoadAuth.mockReturnValue(null);
    mockLoadConfig.mockReturnValue({
      version: 3,
      defaultAgent: "claude",
      defaultScope: "project",
      serverUrl: "https://example.com",
      repos: [],
      agents: {},
    });

    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              downloadUrl: "https://cdn.example.com/skill.tar.gz",
              version: "1.0.0",
              fileHash: "abc",
              fileSize: 100,
            }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 403,
        }),
    );

    await expect(installFromMarketplace("my-skill", {})).rejects.toThrow(
      "Download failed (403)",
    );
  });
});
