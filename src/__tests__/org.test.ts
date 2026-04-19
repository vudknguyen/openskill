import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Hoisted mocks -----------------------------------------------------------

const {
  mockGetValidAuth,
  mockListOrgs,
  mockCreateOrg,
  mockGetOrgMembers,
  mockInviteOrgMember,
  mockGetOrgSkills,
  mockAddSkillToOrg,
  mockRemoveSkillFromOrg,
  mockCreateMarketplaceClient,
  mockLoggerError,
  mockLoggerLog,
  mockLoggerDim,
  mockLoggerNewline,
  mockSpinnerStop,
  mockCreateSpinner,
} = vi.hoisted(() => {
  const mockListOrgs = vi.fn();
  const mockCreateOrg = vi.fn();
  const mockGetOrgMembers = vi.fn();
  const mockInviteOrgMember = vi.fn();
  const mockGetOrgSkills = vi.fn();
  const mockAddSkillToOrg = vi.fn();
  const mockRemoveSkillFromOrg = vi.fn();

  const mockSpinnerStop = vi.fn();
  const mockCreateSpinner = vi.fn().mockReturnValue({ stop: mockSpinnerStop });

  return {
    mockGetValidAuth: vi.fn(),
    mockListOrgs,
    mockCreateOrg,
    mockGetOrgMembers,
    mockInviteOrgMember,
    mockGetOrgSkills,
    mockAddSkillToOrg,
    mockRemoveSkillFromOrg,
    mockCreateMarketplaceClient: vi.fn().mockReturnValue({
      listOrgs: mockListOrgs,
      createOrg: mockCreateOrg,
      getOrgMembers: mockGetOrgMembers,
      inviteOrgMember: mockInviteOrgMember,
      getOrgSkills: mockGetOrgSkills,
      addSkillToOrg: mockAddSkillToOrg,
      removeSkillFromOrg: mockRemoveSkillFromOrg,
    }),
    mockLoggerError: vi.fn(),
    mockLoggerLog: vi.fn(),
    mockLoggerDim: vi.fn(),
    mockLoggerNewline: vi.fn(),
    mockSpinnerStop,
    mockCreateSpinner,
  };
});

vi.mock("../core/token-refresh.js", () => ({
  getValidAuth: mockGetValidAuth,
}));

vi.mock("../core/marketplace-client.js", () => ({
  createMarketplaceClient: mockCreateMarketplaceClient,
}));

vi.mock("../utils/logger.js", () => ({
  logger: {
    error: mockLoggerError,
    log: mockLoggerLog,
    dim: mockLoggerDim,
    newline: mockLoggerNewline,
  },
  createSpinner: mockCreateSpinner,
}));

import { orgCommand } from "../cli/org.js";

// --- Helpers -----------------------------------------------------------------

const AUTH = {
  accessToken: "tok-123",
  refreshToken: "rt-456",
  serverUrl: "http://localhost:3000",
};

/** Run a subcommand, resetting exitCode and suppressing Commander's own exit. */
async function run(...args: string[]) {
  process.exitCode = 0;
  orgCommand.exitOverride(); // throw instead of process.exit on commander errors
  await orgCommand.parseAsync(["node", "org", ...args]);
}

// --- Setup -------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  process.exitCode = 0;
});

// --- Tests -------------------------------------------------------------------

describe("org command", () => {
  // ---- org create -----------------------------------------------------------

  describe("create", () => {
    it("creates org with name and auto-generated slug", async () => {
      mockGetValidAuth.mockResolvedValue(AUTH);
      mockCreateOrg.mockResolvedValue({ id: "org-1", slug: "my-team" });

      await run("create", "My Team");

      expect(mockCreateOrg).toHaveBeenCalledWith(
        { name: "My Team", slug: "my-team", description: undefined },
        "tok-123"
      );
      expect(mockSpinnerStop).toHaveBeenCalledWith(expect.stringContaining("my-team"));
    });

    it("uses provided --slug option", async () => {
      mockGetValidAuth.mockResolvedValue(AUTH);
      mockCreateOrg.mockResolvedValue({ id: "org-2", slug: "custom-slug" });

      await run("create", "My Team", "--slug", "custom-slug");

      expect(mockCreateOrg).toHaveBeenCalledWith(
        expect.objectContaining({ slug: "custom-slug" }),
        "tok-123"
      );
    });

    it("requires auth (getValidAuth null -> error)", async () => {
      mockGetValidAuth.mockResolvedValue(null);

      await run("create", "My Team");

      expect(mockLoggerError).toHaveBeenCalledWith(expect.stringContaining("Not logged in"));
      expect(process.exitCode).toBe(1);
      expect(mockCreateOrg).not.toHaveBeenCalled();
    });
  });

  // ---- org ls ---------------------------------------------------------------

  describe("ls", () => {
    it("lists organizations", async () => {
      mockGetValidAuth.mockResolvedValue(AUTH);
      mockListOrgs.mockResolvedValue([
        {
          id: "o1",
          name: "Acme",
          slug: "acme",
          role: "admin",
          plan: "pro",
          seatLimit: 10,
          requireAuditPass: false,
        },
        {
          id: "o2",
          name: "Beta",
          slug: "beta",
          role: "member",
          plan: "free",
          seatLimit: 5,
          requireAuditPass: true,
        },
      ]);

      await run("ls");

      expect(mockSpinnerStop).toHaveBeenCalledWith("2 organization(s)");
      expect(mockLoggerLog).toHaveBeenCalledWith(expect.stringContaining("Acme"));
      expect(mockLoggerLog).toHaveBeenCalledWith(expect.stringContaining("Beta"));
    });

    it("handles empty org list", async () => {
      mockGetValidAuth.mockResolvedValue(AUTH);
      mockListOrgs.mockResolvedValue([]);

      await run("ls");

      expect(mockSpinnerStop).toHaveBeenCalledWith("0 organization(s)");
      expect(mockLoggerDim).toHaveBeenCalledWith(expect.stringContaining("No organizations yet"));
    });
  });

  // ---- org members ----------------------------------------------------------

  describe("members", () => {
    it("resolves org slug and lists members", async () => {
      mockGetValidAuth.mockResolvedValue(AUTH);
      mockListOrgs.mockResolvedValue([{ id: "o1", slug: "acme" }]);
      mockGetOrgMembers.mockResolvedValue([
        { userName: "Alice", userEmail: "alice@acme.com", role: "admin" },
        { userName: "Bob", userEmail: "bob@acme.com", role: "member" },
      ]);

      await run("members", "acme");

      expect(mockListOrgs).toHaveBeenCalledWith("tok-123");
      expect(mockGetOrgMembers).toHaveBeenCalledWith("o1", "tok-123");
      expect(mockSpinnerStop).toHaveBeenCalledWith("2 member(s)");
      expect(mockLoggerLog).toHaveBeenCalledWith(expect.stringContaining("Alice"));
    });
  });

  // ---- org invite -----------------------------------------------------------

  describe("invite", () => {
    it("sends invitation and shows invite URL", async () => {
      mockGetValidAuth.mockResolvedValue(AUTH);
      mockListOrgs.mockResolvedValue([{ id: "o1", slug: "acme" }]);
      mockInviteOrgMember.mockResolvedValue({ token: "inv-token-abc" });

      await run("invite", "acme", "new@acme.com");

      expect(mockInviteOrgMember).toHaveBeenCalledWith("o1", "new@acme.com", "member", "tok-123");
      expect(mockSpinnerStop).toHaveBeenCalledWith(expect.stringContaining("new@acme.com"));
      expect(mockLoggerLog).toHaveBeenCalledWith(
        expect.stringContaining("http://localhost:3000/org/invite/inv-token-abc")
      );
    });
  });

  // ---- org skills -----------------------------------------------------------

  describe("skills", () => {
    it("lists org skills with audit badges", async () => {
      mockGetValidAuth.mockResolvedValue(AUTH);
      mockListOrgs.mockResolvedValue([{ id: "o1", slug: "acme" }]);
      mockGetOrgSkills.mockResolvedValue({
        organization: { name: "Acme", requireAuditPass: true },
        skills: [
          {
            skillName: "Deploy",
            skillSlug: "deploy",
            skillDescription: "Deploy tool for CI",
            skillAuditStatus: "pass",
            skillId: "s1",
          },
          {
            skillName: "Risky",
            skillSlug: "risky",
            skillDescription: "Does risky things",
            skillAuditStatus: "fail",
            skillId: "s2",
          },
          {
            skillName: "Unknown",
            skillSlug: "unknown",
            skillDescription: "Not audited yet",
            skillAuditStatus: "pending",
            skillId: "s3",
          },
        ],
      });

      await run("skills", "acme");

      expect(mockSpinnerStop).toHaveBeenCalledWith(expect.stringContaining("3 skill(s)"));
      expect(mockLoggerDim).toHaveBeenCalledWith(expect.stringContaining("Audit policy"));
      // Check audit badges in output
      const logCalls = mockLoggerLog.mock.calls.map((c: unknown[]) => String(c[0]));
      expect(logCalls.some((s) => s.includes("\u2713") && s.includes("Deploy"))).toBe(true);
      expect(logCalls.some((s) => s.includes("\u2717") && s.includes("Risky"))).toBe(true);
      expect(logCalls.some((s) => s.includes("?") && s.includes("Unknown"))).toBe(true);
    });

    it("handles empty skills list", async () => {
      mockGetValidAuth.mockResolvedValue(AUTH);
      mockListOrgs.mockResolvedValue([{ id: "o1", slug: "acme" }]);
      mockGetOrgSkills.mockResolvedValue({
        organization: { name: "Acme", requireAuditPass: false },
        skills: [],
      });

      await run("skills", "acme");

      expect(mockSpinnerStop).toHaveBeenCalledWith(expect.stringContaining("0 skill(s)"));
      expect(mockLoggerDim).toHaveBeenCalledWith(expect.stringContaining("No skills in registry"));
    });
  });

  // ---- org add-skill --------------------------------------------------------

  describe("add-skill", () => {
    it("adds skill to org registry", async () => {
      mockGetValidAuth.mockResolvedValue(AUTH);
      mockListOrgs.mockResolvedValue([{ id: "o1", slug: "acme" }]);
      mockAddSkillToOrg.mockResolvedValue({});

      await run("add-skill", "acme", "deploy-tool");

      expect(mockAddSkillToOrg).toHaveBeenCalledWith("o1", "deploy-tool", "tok-123");
      expect(mockSpinnerStop).toHaveBeenCalledWith(expect.stringContaining("deploy-tool"));
    });
  });

  // ---- org rm-skill ---------------------------------------------------------

  describe("rm-skill", () => {
    it("resolves skill by slug and removes by ID", async () => {
      mockGetValidAuth.mockResolvedValue(AUTH);
      mockListOrgs.mockResolvedValue([{ id: "o1", slug: "acme" }]);
      mockGetOrgSkills.mockResolvedValue({
        organization: { name: "Acme" },
        skills: [
          { skillSlug: "deploy-tool", skillId: "s1", skillName: "Deploy" },
          { skillSlug: "lint-helper", skillId: "s2", skillName: "Lint" },
        ],
      });
      mockRemoveSkillFromOrg.mockResolvedValue({});

      await run("rm-skill", "acme", "deploy-tool");

      expect(mockRemoveSkillFromOrg).toHaveBeenCalledWith("o1", "s1", "tok-123");
      expect(mockSpinnerStop).toHaveBeenCalledWith(expect.stringContaining("deploy-tool"));
    });

    it("handles skill not found in registry", async () => {
      mockGetValidAuth.mockResolvedValue(AUTH);
      mockListOrgs.mockResolvedValue([{ id: "o1", slug: "acme" }]);
      mockGetOrgSkills.mockResolvedValue({
        organization: { name: "Acme" },
        skills: [],
      });

      await run("rm-skill", "acme", "nonexistent");

      expect(mockLoggerError).toHaveBeenCalledWith(expect.stringContaining("nonexistent"));
      expect(process.exitCode).toBe(1);
      expect(mockRemoveSkillFromOrg).not.toHaveBeenCalled();
    });
  });

  // ---- resolveOrgId ---------------------------------------------------------

  describe("resolveOrgId (org not found)", () => {
    it("shows error message with suggestion when org not found", async () => {
      mockGetValidAuth.mockResolvedValue(AUTH);
      mockListOrgs.mockResolvedValue([{ id: "o1", slug: "acme" }]);

      // process.exit must throw to halt execution (otherwise code continues past it)
      const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
        throw new Error("process.exit");
      }) as never);

      // Use members subcommand to trigger resolveOrgId with a non-existent org
      await expect(run("members", "nonexistent")).rejects.toThrow("process.exit");

      expect(mockLoggerError).toHaveBeenCalledWith(expect.stringContaining("nonexistent"));
      expect(mockLoggerError).toHaveBeenCalledWith(expect.stringContaining("osk org ls"));
      expect(exitSpy).toHaveBeenCalledWith(1);
    });
  });
});
