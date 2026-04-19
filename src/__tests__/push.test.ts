import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock all dependencies before importing the push command
vi.mock("../core/token-refresh.js", () => ({
  getValidAuth: vi.fn(),
}));

vi.mock("../core/package.js", () => ({
  packageSkill: vi.fn(),
  calculateHash: vi.fn(),
  formatFileSize: vi.fn(),
}));

vi.mock("../utils/markdown.js", () => ({
  parseSkillMd: vi.fn(),
}));

vi.mock("../utils/logger.js", () => ({
  logger: {
    error: vi.fn(),
    log: vi.fn(),
    dim: vi.fn(),
    success: vi.fn(),
    newline: vi.fn(),
    cancelled: vi.fn(),
  },
  createSpinner: vi.fn(() => ({
    stop: vi.fn(),
  })),
}));

vi.mock("../utils/prompt.js", () => ({
  confirm: vi.fn(),
}));

vi.mock("../utils/url.js", () => ({
  validateServerUrl: vi.fn((url: string) => url),
}));

vi.mock("../utils/audit-display.js", () => ({
  displayFindings: vi.fn(),
}));

vi.mock("fs", () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));

vi.mock("../core/config.js", () => ({
  loadConfig: vi.fn(() => ({
    defaultOrg: undefined,
    serverUrl: "https://marketplace.example.com",
    telemetryEnabled: false,
    defaultAgent: "claude",
    defaultScope: "project",
    repos: [],
    agents: {},
    version: 3,
  })),
}));

const mockInitPublish = vi.fn();
const mockUploadToPresignedUrl = vi.fn();
const mockCompletePublish = vi.fn();
const mockListOrgs = vi.fn();

vi.mock("../core/marketplace-client.js", () => ({
  createMarketplaceClient: vi.fn(() => ({
    initPublish: mockInitPublish,
    uploadToPresignedUrl: mockUploadToPresignedUrl,
    completePublish: mockCompletePublish,
    listOrgs: mockListOrgs,
  })),
  MarketplaceApiError: class MarketplaceApiError extends Error {
    status: number;
    body?: unknown;
    constructor(message: string, status: number, body?: unknown) {
      super(message);
      this.name = "MarketplaceApiError";
      this.status = status;
      this.body = body;
    }
  },
}));

import { getValidAuth } from "../core/token-refresh.js";
import { packageSkill, calculateHash, formatFileSize } from "../core/package.js";
import { parseSkillMd } from "../utils/markdown.js";
import { logger } from "../utils/logger.js";
import { confirm } from "../utils/prompt.js";
import { existsSync, readFileSync } from "fs";
import { displayFindings } from "../utils/audit-display.js";
import { MarketplaceApiError } from "../core/marketplace-client.js";
import { pushCommand } from "../cli/push.js";

const mockGetValidAuth = vi.mocked(getValidAuth);
const mockPackageSkill = vi.mocked(packageSkill);
const mockCalculateHash = vi.mocked(calculateHash);
const mockFormatFileSize = vi.mocked(formatFileSize);
const mockParseSkillMd = vi.mocked(parseSkillMd);
const mockConfirm = vi.mocked(confirm);
const mockExistsSync = vi.mocked(existsSync);
const mockReadFileSync = vi.mocked(readFileSync);
const mockDisplayFindings = vi.mocked(displayFindings);

const AUTH = {
  accessToken: "tok-123",
  refreshToken: "rt-456",
  serverUrl: "https://marketplace.example.com",
  expiresAt: new Date(Date.now() + 3600_000).toISOString(),
  createdAt: new Date().toISOString(),
};

const SKILL_FRONTMATTER = {
  name: "my-skill",
  description: "A test skill",
  metadata: { version: "1.0.0" },
};

function setupDefaults() {
  mockGetValidAuth.mockResolvedValue(AUTH);
  mockExistsSync.mockReturnValue(true);
  mockReadFileSync.mockReturnValue("---\nname: my-skill\n---\nContent");
  mockParseSkillMd.mockReturnValue({
    frontmatter: SKILL_FRONTMATTER,
    content: "Content",
    raw: "---\nname: my-skill\n---\nContent",
  });
  mockPackageSkill.mockResolvedValue(Buffer.from("packed-data"));
  mockCalculateHash.mockReturnValue("abc123def456ghij7890");
  mockFormatFileSize.mockReturnValue("11 B");
  mockConfirm.mockResolvedValue(true);
  mockInitPublish.mockResolvedValue({
    uploadUrl: "https://s3.example.com/upload",
    uploadKey: "key-1",
  });
  mockUploadToPresignedUrl.mockResolvedValue(undefined);
  mockCompletePublish.mockResolvedValue({
    success: true,
    slug: "my-skill",
    version: "1.0.0",
    name: "My Skill",
  });
}

/** Run the push command action with given args/options */
async function runPush(
  directory = ".",
  options: Record<string, string | boolean> = {}
) {
  const mergedOpts: Record<string, string | boolean> = { yes: true, ...options };
  const args = [directory];
  if (mergedOpts.yes) args.push("--yes");
  if (mergedOpts.server) args.push("--server", String(mergedOpts.server));
  if (mergedOpts.org) args.push("--org", String(mergedOpts.org));
  if (mergedOpts.visibility) args.push("--visibility", String(mergedOpts.visibility));
  if (mergedOpts.shortDesc) args.push("--short-desc", String(mergedOpts.shortDesc));
  if (mergedOpts.tags) args.push("--tags", String(mergedOpts.tags));
  if (mergedOpts.changelog) args.push("--changelog", String(mergedOpts.changelog));

  await pushCommand.parseAsync(args, { from: "user" });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let exitSpy: any;

beforeEach(() => {
  vi.restoreAllMocks();
  mockInitPublish.mockReset();
  mockUploadToPresignedUrl.mockReset();
  mockCompletePublish.mockReset();
  mockListOrgs.mockReset();
   
  exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
    throw new Error("process.exit");
  }) as never);
});

describe("push command", () => {
  // 1. Push requires authentication
  describe("authentication", () => {
    it("exits with error when getValidAuth returns null", async () => {
      mockGetValidAuth.mockResolvedValue(null);

      await expect(runPush()).rejects.toThrow("process.exit");

      expect(exitSpy).toHaveBeenCalledWith(1);
      expect(logger.error).toHaveBeenCalledWith(
        "Not logged in. Run 'osk login' first."
      );
    });
  });

  // 2. Push packages skill directory and calculates hash
  describe("packaging", () => {
    it("packages the skill directory and calculates hash", async () => {
      setupDefaults();

      await runPush();

      expect(mockPackageSkill).toHaveBeenCalledWith(expect.any(String));
      expect(mockCalculateHash).toHaveBeenCalledWith(Buffer.from("packed-data"));
    });
  });

  // 3. Push shows summary before confirmation
  describe("summary display", () => {
    it("shows name, version, size, and hash before confirmation", async () => {
      setupDefaults();
      mockConfirm.mockResolvedValue(true);

      await runPush(".", { yes: false });

      expect(logger.log).toHaveBeenCalledWith(expect.stringContaining("my-skill"));
      expect(logger.log).toHaveBeenCalledWith(expect.stringContaining("1.0.0"));
      expect(logger.log).toHaveBeenCalledWith(expect.stringContaining("11 B"));
      expect(logger.log).toHaveBeenCalledWith(expect.stringContaining("abc123def456ghij"));
    });
  });

  // 4. Push handles "unchanged" response from initPublish
  describe("unchanged response", () => {
    it("returns early when initPublish responds with unchanged", async () => {
      setupDefaults();
      mockInitPublish.mockResolvedValue({
        unchanged: true,
        name: "my-skill",
        version: "1.0.0",
      });

      await runPush();

      expect(logger.dim).toHaveBeenCalledWith(
        "my-skill@1.0.0 is already up to date"
      );
      // Should NOT proceed to upload or complete
      expect(mockUploadToPresignedUrl).not.toHaveBeenCalled();
      expect(mockCompletePublish).not.toHaveBeenCalled();
    });
  });

  // 5. Push handles initPublish missing uploadUrl/uploadKey
  describe("missing upload info", () => {
    it("exits with error when initPublish returns no uploadUrl or uploadKey", async () => {
      setupDefaults();
      mockInitPublish.mockResolvedValue({});

      await expect(runPush()).rejects.toThrow("process.exit");

      expect(exitSpy).toHaveBeenCalledWith(1);
      expect(logger.error).toHaveBeenCalledWith(
        "Server response missing upload information"
      );
    });
  });

  // 6. Push re-authenticates before completePublish (stale token fix)
  describe("re-authentication before completePublish", () => {
    it("calls getValidAuth twice: once at start and once before completePublish", async () => {
      setupDefaults();

      await runPush();

      expect(mockGetValidAuth).toHaveBeenCalledTimes(2);
    });
  });

  // 7. Push handles completePublish session expiry (freshAuth returns null)
  describe("session expiry during upload", () => {
    it("exits with error when freshAuth returns null before completePublish", async () => {
      setupDefaults();
      // First call succeeds, second returns null (session expired)
      mockGetValidAuth
        .mockResolvedValueOnce(AUTH)
        .mockResolvedValueOnce(null);

      await expect(runPush()).rejects.toThrow("process.exit");

      expect(exitSpy).toHaveBeenCalledWith(1);
      expect(logger.error).toHaveBeenCalledWith(
        "Session expired during upload. Run 'osk login' and try again."
      );
    });
  });

  // 8. Push displays audit findings on success
  describe("audit findings on success", () => {
    it("displays audit warnings when completePublish returns findings", async () => {
      setupDefaults();
      const findings = [
        {
          rule: "broad-file-glob",
          severity: "info" as const,
          message: "Broad file glob",
          line: 8,
          snippet: "**/*",
        },
      ];
      mockCompletePublish.mockResolvedValue({
        success: true,
        slug: "my-skill",
        version: "1.0.0",
        name: "My Skill",
        auditFindings: findings,
      });

      await runPush();

      expect(mockDisplayFindings).toHaveBeenCalledWith(
        findings,
        "Security audit warnings:"
      );
    });
  });

  // 9. Push handles audit failure with findings
  describe("audit failure", () => {
    it("displays audit findings and exits on audit failure from completePublish", async () => {
      setupDefaults();
      const findings = [
        {
          rule: "no-shell-injection",
          severity: "critical" as const,
          message: "Shell injection risk detected",
          line: 42,
          snippet: "dangerous pattern",
        },
      ];
      const apiError = new MarketplaceApiError("Security audit failed", 422, {
        auditStatus: "fail",
        findings,
      });
      mockCompletePublish.mockRejectedValue(apiError);

      await expect(runPush()).rejects.toThrow("process.exit");

      expect(logger.error).toHaveBeenCalledWith("Skill failed security audit");
      expect(mockDisplayFindings).toHaveBeenCalledWith(findings);
      expect(exitSpy).toHaveBeenCalledWith(1);
    });
  });

  // 10. Push with --org resolves org slug to ID
  describe("--org flag", () => {
    it("resolves org slug to ID via listOrgs", async () => {
      setupDefaults();
      mockListOrgs.mockResolvedValue([
        { id: "org-1", slug: "my-team", name: "My Team" },
        { id: "org-2", slug: "other-team", name: "Other Team" },
      ]);

      await runPush(".", { org: "my-team" });

      expect(mockListOrgs).toHaveBeenCalledWith(AUTH.accessToken);
      expect(mockInitPublish).toHaveBeenCalledWith(
        AUTH.accessToken,
        expect.objectContaining({ organizationId: "org-1" })
      );
      expect(mockCompletePublish).toHaveBeenCalledWith(
        AUTH.accessToken,
        expect.objectContaining({ organizationId: "org-1" })
      );
    });
  });
});
