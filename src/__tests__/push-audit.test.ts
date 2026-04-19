import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  MarketplaceClient,
  MarketplaceApiError,
  type AuditFinding,
  type PushCompleteResponse,
} from "../core/marketplace-client.js";
import { mockFetch } from "./helpers/mock-fetch.js";

const SERVER = "https://marketplace.example.com";

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("Push audit findings", () => {
  describe("completePublish audit error handling", () => {
    it("throws MarketplaceApiError with audit findings in body on failure", async () => {
      const errorBody = {
        success: false,
        slug: "bad-skill",
        version: "1.0.0",
        name: "Bad Skill",
        error: "Security audit failed",
        auditStatus: "fail",
        findings: [
          {
            rule: "no-shell-exec",
            severity: "critical",
            message: "Direct shell execution detected",
            line: 42,
            snippet: "exec('rm -rf /')",
          },
          {
            rule: "no-env-access",
            severity: "warning",
            message: "Environment variable access",
            line: 15,
            snippet: "process.env.API_KEY",
          },
        ],
      };

      mockFetch({
        ok: false,
        status: 422,
        json: () => Promise.resolve(errorBody),
      });
      const client = new MarketplaceClient(SERVER);

      const err = await client
        .completePublish("tok", { uploadKey: "k", slug: "bad-skill", fileHash: "h" })
        .catch((e) => e);

      expect(err).toBeInstanceOf(MarketplaceApiError);
      expect(err.message).toBe("Security audit failed");
      expect(err.status).toBe(422);

      // The body is preserved so push.ts can inspect auditStatus and findings
      const body = err.body as Record<string, unknown>;
      expect(body.auditStatus).toBe("fail");
      expect(Array.isArray(body.findings)).toBe(true);

      const findings = body.findings as AuditFinding[];
      expect(findings).toHaveLength(2);
      expect(findings[0].rule).toBe("no-shell-exec");
      expect(findings[0].severity).toBe("critical");
      expect(findings[1].rule).toBe("no-env-access");
      expect(findings[1].severity).toBe("warning");
    });

    it("throws MarketplaceApiError with details array on validation failure", async () => {
      const errorBody = {
        success: false,
        slug: "",
        version: "",
        name: "",
        error: "Validation failed",
        details: ["Missing required field: name", "Slug too long"],
      };

      mockFetch({
        ok: false,
        status: 422,
        json: () => Promise.resolve(errorBody),
      });
      const client = new MarketplaceClient(SERVER);

      const err = await client
        .completePublish("tok", { uploadKey: "k", slug: "s", fileHash: "h" })
        .catch((e) => e);

      expect(err).toBeInstanceOf(MarketplaceApiError);
      expect(err.message).toBe("Validation failed");
      expect(err.status).toBe(422);

      const body = err.body as Record<string, unknown>;
      expect(body.details).toEqual(["Missing required field: name", "Slug too long"]);
    });

    it("returns auditFindings on successful response", async () => {
      const successBody: PushCompleteResponse = {
        success: true,
        slug: "my-skill",
        version: "1.2.0",
        name: "My Skill",
        auditFindings: [
          {
            rule: "broad-file-glob",
            severity: "info",
            message: "Broad file glob pattern found",
            line: 8,
            snippet: "**/*",
          },
        ],
      };

      mockFetch({ json: () => Promise.resolve(successBody) });
      const client = new MarketplaceClient(SERVER);

      const result = await client.completePublish("tok", {
        uploadKey: "k",
        slug: "my-skill",
        fileHash: "h",
      });

      expect(result.success).toBe(true);
      expect(result.slug).toBe("my-skill");
      expect(result.version).toBe("1.2.0");
      expect(result.auditFindings).toHaveLength(1);
      expect(result.auditFindings![0].severity).toBe("info");
      expect(result.auditFindings![0].rule).toBe("broad-file-glob");
    });

    it("returns successfully without auditFindings when none present", async () => {
      const successBody: PushCompleteResponse = {
        success: true,
        slug: "clean-skill",
        version: "1.0.0",
        name: "Clean Skill",
      };

      mockFetch({ json: () => Promise.resolve(successBody) });
      const client = new MarketplaceClient(SERVER);

      const result = await client.completePublish("tok", {
        uploadKey: "k",
        slug: "clean-skill",
        fileHash: "h",
      });

      expect(result.success).toBe(true);
      expect(result.auditFindings).toBeUndefined();
    });

    it("falls back to generic server error message when body has no error field", async () => {
      mockFetch({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ success: false, slug: "", version: "", name: "" }),
      });
      const client = new MarketplaceClient(SERVER);

      const err = await client
        .completePublish("tok", { uploadKey: "k", slug: "s", fileHash: "h" })
        .catch((e) => e);

      expect(err).toBeInstanceOf(MarketplaceApiError);
      expect(err.message).toBe("Server error (500)");
      expect(err.status).toBe(500);
    });
  });
});
