import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock marketplace client
const { mockGetSkillDownload, mockDownloadFromPresignedUrl, mockCreateMarketplaceClient } = vi.hoisted(() => {
  const mockGetSkillDownload = vi.fn();
  const mockDownloadFromPresignedUrl = vi.fn();
  return {
    mockGetSkillDownload,
    mockDownloadFromPresignedUrl,
    mockCreateMarketplaceClient: vi.fn().mockReturnValue({
      getSkillDownload: mockGetSkillDownload,
      downloadFromPresignedUrl: mockDownloadFromPresignedUrl,
    }),
  };
});

vi.mock("../core/marketplace-client.js", () => ({
  createMarketplaceClient: mockCreateMarketplaceClient,
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

import { loadSkillFromDir } from "../core/skill.js";
import { addSkillRecord } from "../core/manifest.js";
import { getAgent } from "../agents/index.js";
import { rmSync } from "fs";
import {
  fetchMarketplaceSkill,
  installFromMarketplace,
} from "../core/marketplace-installer.js";

const mockLoadSkillFromDir = vi.mocked(loadSkillFromDir);
const mockAddSkillRecord = vi.mocked(addSkillRecord);
const mockGetAgent = vi.mocked(getAgent);
const mockRmSync = vi.mocked(rmSync);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("fetchMarketplaceSkill", () => {
  it("delegates to client.getSkillDownload and returns metadata", async () => {
    const metadata = {
      downloadUrl: "https://cdn.example.com/skill.tar.gz",
      version: "1.0.0",
      fileHash: "abc123",
      fileSize: 4096,
    };
    mockGetSkillDownload.mockResolvedValue(metadata);

    const result = await fetchMarketplaceSkill("https://example.com", "my-skill");

    expect(result).toEqual(metadata);
    expect(mockCreateMarketplaceClient).toHaveBeenCalledWith("https://example.com");
    expect(mockGetSkillDownload).toHaveBeenCalledWith("my-skill", undefined);
  });

  it("passes version to client.getSkillDownload", async () => {
    mockGetSkillDownload.mockResolvedValue({
      downloadUrl: "",
      version: "2.0.0",
      fileHash: null,
      fileSize: null,
    });

    await fetchMarketplaceSkill("https://example.com", "my-skill", "2.0.0");

    expect(mockGetSkillDownload).toHaveBeenCalledWith("my-skill", "2.0.0");
  });

  it("throws with server error message when client throws", async () => {
    mockGetSkillDownload.mockRejectedValue(new Error("Skill not found"));

    await expect(
      fetchMarketplaceSkill("https://example.com", "nonexistent"),
    ).rejects.toThrow("Skill not found");
  });
});

describe("installFromMarketplace", () => {
  function setupMocks() {
    const metadata = {
      downloadUrl: "https://cdn.example.com/skill.tar.gz",
      version: "1.0.0",
      fileHash: "abc123hash",
      fileSize: 2048,
    };

    mockGetSkillDownload.mockResolvedValue(metadata);
    mockDownloadFromPresignedUrl.mockResolvedValue(Buffer.from("fake-tar-data"));

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

    expect(mockGetSkillDownload).toHaveBeenCalledWith("my-skill", undefined);
    expect(mockDownloadFromPresignedUrl).toHaveBeenCalledWith("https://cdn.example.com/skill.tar.gz");
    expect(mockAgent.installSkill).toHaveBeenCalled();
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

  it("passes server override to createMarketplaceClient", async () => {
    setupMocks();

    await installFromMarketplace("my-skill", { server: "https://custom.server.com" });

    expect(mockCreateMarketplaceClient).toHaveBeenCalledWith("https://custom.server.com");
  });

  it("passes version to client.getSkillDownload", async () => {
    setupMocks();

    await installFromMarketplace("my-skill", { version: "2.0.0" });

    expect(mockGetSkillDownload).toHaveBeenCalledWith("my-skill", "2.0.0");
  });

  it("throws when metadata fetch fails", async () => {
    mockGetSkillDownload.mockRejectedValue(new Error("Not found"));

    await expect(installFromMarketplace("nonexistent", {})).rejects.toThrow(
      "Failed to find 'nonexistent' on marketplace",
    );
  });

  it("throws when download fails", async () => {
    setupMocks();
    mockDownloadFromPresignedUrl.mockRejectedValue(new Error("Download failed (403)"));

    await expect(installFromMarketplace("my-skill", {})).rejects.toThrow(
      "Download failed (403)",
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

  it("uses version as commitHash when fileHash is null", async () => {
    setupMocks();
    mockGetSkillDownload.mockResolvedValue({
      downloadUrl: "https://cdn.example.com/skill.tar.gz",
      version: "2.0.0",
      fileHash: null,
      fileSize: null,
    });

    await installFromMarketplace("my-skill", {});

    expect(mockAddSkillRecord).toHaveBeenCalledWith(
      expect.objectContaining({ commitHash: "2.0.0" }),
    );
  });

  it("cleans up temp directory even when install fails", async () => {
    setupMocks();
    mockLoadSkillFromDir.mockReturnValue(null);

    await expect(installFromMarketplace("my-skill", {})).rejects.toThrow();

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
});
