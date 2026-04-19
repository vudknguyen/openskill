import { describe, it, expect, vi, beforeEach } from "vitest";
import { MarketplaceClient, MarketplaceApiError } from "../core/marketplace-client.js";
import { mockFetch } from "./helpers/mock-fetch.js";

const SERVER = "https://marketplace.example.com";

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("MarketplaceClient", () => {
  // --- requestDeviceCode ---------------------------------------------------

  describe("requestDeviceCode", () => {
    it("POSTs to /api/auth/device/code with client_info", async () => {
      const body = {
        device_code: "dc-123",
        user_code: "ABCD-1234",
        verification_uri: "https://example.com/device",
        verification_uri_complete: "https://example.com/device?code=ABCD-1234",
        expires_in: 900,
        interval: 5,
      };
      const fetcher = mockFetch({ json: () => Promise.resolve(body) });
      const client = new MarketplaceClient(SERVER);

      const result = await client.requestDeviceCode("osk/0.1.0 darwin");

      expect(result).toEqual(body);
      expect(fetcher).toHaveBeenCalledWith(
        `${SERVER}/api/auth/device/code`,
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ client_info: "osk/0.1.0 darwin" }),
        })
      );
    });

    it("throws MarketplaceApiError on non-ok response", async () => {
      mockFetch({ ok: false, status: 500 });
      const client = new MarketplaceClient(SERVER);

      await expect(client.requestDeviceCode()).rejects.toThrow(MarketplaceApiError);
      await expect(client.requestDeviceCode()).rejects.toThrow("Server returned 500");
    });
  });

  // --- pollDeviceToken -----------------------------------------------------

  describe("pollDeviceToken", () => {
    it("returns parsed JSON body as-is (success case)", async () => {
      const tokenBody = {
        access_token: "at-123",
        refresh_token: "rt-456",
        token_type: "bearer",
        expires_in: 900,
      };
      mockFetch({ json: () => Promise.resolve(tokenBody) });
      const client = new MarketplaceClient(SERVER);

      const result = await client.pollDeviceToken("dc-123");

      expect(result).toEqual(tokenBody);
    });

    it("returns error body as-is (pending case)", async () => {
      const errorBody = { error: "authorization_pending" };
      mockFetch({ ok: false, status: 400, json: () => Promise.resolve(errorBody) });
      const client = new MarketplaceClient(SERVER);

      const result = await client.pollDeviceToken("dc-123");

      expect(result).toEqual(errorBody);
    });

    it("throws MarketplaceApiError on server 500 response", async () => {
      mockFetch({
        ok: false,
        status: 500,
        json: () => Promise.reject(new SyntaxError("Unexpected token <")),
      });
      const client = new MarketplaceClient(SERVER);

      await expect(client.pollDeviceToken("dc-123")).rejects.toThrow(MarketplaceApiError);
      await expect(client.pollDeviceToken("dc-123")).rejects.toThrow("Server error (500)");
    });
  });

  // --- fetchCurrentUser ----------------------------------------------------

  describe("fetchCurrentUser", () => {
    it("GETs /api/auth/me with Bearer token and returns user", async () => {
      const user = { id: "u-1", name: "Alice", email: "alice@test.com" };
      const fetcher = mockFetch({ json: () => Promise.resolve({ user }) });
      const client = new MarketplaceClient(SERVER);

      const result = await client.fetchCurrentUser("my-token");

      expect(result).toEqual(user);
      expect(fetcher).toHaveBeenCalledWith(
        `${SERVER}/api/auth/me`,
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: "Bearer my-token" }),
        })
      );
    });

    it("throws on non-ok response", async () => {
      mockFetch({ ok: false, status: 401 });
      const client = new MarketplaceClient(SERVER);

      await expect(client.fetchCurrentUser("bad-token")).rejects.toThrow(
        "Failed to fetch user (401)"
      );
    });
  });

  // --- refreshToken --------------------------------------------------------

  describe("refreshToken", () => {
    it("POSTs to /api/auth/refresh and returns data", async () => {
      const refreshData = {
        access_token: "new-at",
        refresh_token: "new-rt",
        token_type: "bearer",
        expires_in: 900,
      };
      const fetcher = mockFetch({ json: () => Promise.resolve(refreshData) });
      const client = new MarketplaceClient(SERVER);

      const result = await client.refreshToken("old-rt");

      expect(result).toEqual(refreshData);
      expect(fetcher).toHaveBeenCalledWith(
        `${SERVER}/api/auth/refresh`,
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ refresh_token: "old-rt" }),
        })
      );
    });

    it("throws MarketplaceApiError on non-ok response", async () => {
      mockFetch({ ok: false, status: 401 });
      const client = new MarketplaceClient(SERVER);

      const err = await client.refreshToken("expired-rt").catch((e) => e);
      expect(err).toBeInstanceOf(MarketplaceApiError);
      expect(err.status).toBe(401);
    });
  });

  // --- revokeToken ---------------------------------------------------------

  describe("revokeToken", () => {
    it("POSTs to /api/auth/revoke", async () => {
      const fetcher = mockFetch({});
      const client = new MarketplaceClient(SERVER);

      await client.revokeToken("rt-to-revoke");

      expect(fetcher).toHaveBeenCalledWith(
        `${SERVER}/api/auth/revoke`,
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ refresh_token: "rt-to-revoke" }),
        })
      );
    });

    it("swallows fetch errors silently", async () => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network")));
      const client = new MarketplaceClient(SERVER);

      // Should not throw
      await expect(client.revokeToken("rt")).resolves.toBeUndefined();
    });
  });

  // --- searchSkills --------------------------------------------------------

  describe("searchSkills", () => {
    it("GETs /api/skills with query params", async () => {
      const data = { skills: [], pagination: { total: 0 } };
      const fetcher = mockFetch({ json: () => Promise.resolve(data) });
      const client = new MarketplaceClient(SERVER);

      const result = await client.searchSkills("deploy", 10);

      expect(result).toEqual(data);
      const url = fetcher.mock.calls[0][0] as string;
      expect(url).toContain("/api/skills?");
      expect(url).toContain("q=deploy");
      expect(url).toContain("limit=10");
    });

    it("defaults limit to 20", async () => {
      const fetcher = mockFetch({
        json: () => Promise.resolve({ skills: [], pagination: { total: 0 } }),
      });
      const client = new MarketplaceClient(SERVER);

      await client.searchSkills("test");

      const url = fetcher.mock.calls[0][0] as string;
      expect(url).toContain("limit=20");
    });

    it("throws on non-ok response", async () => {
      mockFetch({ ok: false, status: 500 });
      const client = new MarketplaceClient(SERVER);

      await expect(client.searchSkills("q")).rejects.toThrow("Marketplace search failed (500)");
    });
  });

  // --- getSkillDownload ----------------------------------------------------

  describe("getSkillDownload", () => {
    it("GETs /api/skills/{slug}/download", async () => {
      const metadata = {
        downloadUrl: "https://cdn.example.com/skill.tar.gz",
        version: "1.0.0",
        fileHash: "abc123",
        fileSize: 4096,
      };
      const fetcher = mockFetch({ json: () => Promise.resolve(metadata) });
      const client = new MarketplaceClient(SERVER);

      const result = await client.getSkillDownload("my-skill");

      expect(result).toEqual(metadata);
      const url = fetcher.mock.calls[0][0] as string;
      expect(url).toContain("/api/skills/my-skill/download");
      expect(url).not.toContain("version=");
    });

    it("appends version query param when provided", async () => {
      const fetcher = mockFetch({
        json: () =>
          Promise.resolve({ downloadUrl: "", version: "2.0.0", fileHash: null, fileSize: null }),
      });
      const client = new MarketplaceClient(SERVER);

      await client.getSkillDownload("my-skill", "2.0.0");

      const url = fetcher.mock.calls[0][0] as string;
      expect(url).toContain("version=2.0.0");
    });

    it("throws with error message from body on non-ok", async () => {
      mockFetch({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ error: "Skill not found" }),
      });
      const client = new MarketplaceClient(SERVER);

      await expect(client.getSkillDownload("nope")).rejects.toThrow("Skill not found");
    });

    it("throws with status when body parse fails", async () => {
      mockFetch({
        ok: false,
        status: 502,
        json: () => Promise.reject(new Error("bad json")),
      });
      const client = new MarketplaceClient(SERVER);

      await expect(client.getSkillDownload("nope")).rejects.toThrow("Server returned 502");
    });
  });

  // --- getSkillVersions ----------------------------------------------------

  describe("getSkillVersions", () => {
    it("GETs /api/skills/{slug}/versions", async () => {
      const data = {
        versions: [{ version: "1.0.0", fileHash: "h1", changelog: null, isLatest: true }],
      };
      const fetcher = mockFetch({ json: () => Promise.resolve(data) });
      const client = new MarketplaceClient(SERVER);

      const result = await client.getSkillVersions("my-skill");

      expect(result).toEqual(data);
      const url = fetcher.mock.calls[0][0] as string;
      expect(url).toContain("/api/skills/my-skill/versions");
    });

    it("throws on non-ok response", async () => {
      mockFetch({ ok: false, status: 404 });
      const client = new MarketplaceClient(SERVER);

      await expect(client.getSkillVersions("nope")).rejects.toThrow(
        "Failed to fetch versions (404)"
      );
    });
  });

  // --- updateSkillStatus ---------------------------------------------------

  describe("updateSkillStatus", () => {
    it("PATCHes /api/skills/{slug} with status and Bearer token", async () => {
      const body = { success: true, status: "published" };
      const fetcher = mockFetch({ json: () => Promise.resolve(body) });
      const client = new MarketplaceClient(SERVER);

      const result = await client.updateSkillStatus("tok", "my-skill", "published");

      expect(result).toEqual(body);
      expect(fetcher).toHaveBeenCalledWith(
        expect.stringContaining("/api/skills/my-skill"),
        expect.objectContaining({
          method: "PATCH",
          headers: expect.objectContaining({ Authorization: "Bearer tok" }),
          body: JSON.stringify({ status: "published" }),
        })
      );
    });

    it("throws MarketplaceApiError with body.error on non-ok", async () => {
      mockFetch({
        ok: false,
        status: 403,
        json: () => Promise.resolve({ error: "Not authorized" }),
      });
      const client = new MarketplaceClient(SERVER);

      await expect(client.updateSkillStatus("tok", "slug", "published")).rejects.toThrow(
        "Not authorized"
      );
    });
  });

  // --- initPublish ---------------------------------------------------------

  describe("initPublish", () => {
    it("POSTs to /api/skills/publish/init with Bearer token", async () => {
      const body = { uploadUrl: "https://s3.example.com/upload", uploadKey: "key-1" };
      const fetcher = mockFetch({ json: () => Promise.resolve(body) });
      const client = new MarketplaceClient(SERVER);

      const result = await client.initPublish("tok", {
        slug: "my-skill",
        fileHash: "abc",
        fileSize: 1024,
      });

      expect(result).toEqual(body);
      expect(fetcher).toHaveBeenCalledWith(
        `${SERVER}/api/skills/publish/init`,
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({ Authorization: "Bearer tok" }),
        })
      );
    });

    it("throws on non-ok with error from body", async () => {
      mockFetch({
        ok: false,
        status: 409,
        json: () => Promise.resolve({ error: "Duplicate" }),
      });
      const client = new MarketplaceClient(SERVER);

      await expect(
        client.initPublish("tok", { slug: "s", fileHash: "h", fileSize: 0 })
      ).rejects.toThrow("Duplicate");
    });
  });

  // --- completePublish -----------------------------------------------------

  describe("completePublish", () => {
    it("POSTs to /api/skills/publish/complete with Bearer token", async () => {
      const body = { success: true, slug: "my-skill", version: "1.0.0", name: "My Skill" };
      const fetcher = mockFetch({ json: () => Promise.resolve(body) });
      const client = new MarketplaceClient(SERVER);

      const result = await client.completePublish("tok", {
        uploadKey: "key-1",
        slug: "my-skill",
        fileHash: "abc",
      });

      expect(result).toEqual(body);
      expect(fetcher).toHaveBeenCalledWith(
        `${SERVER}/api/skills/publish/complete`,
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({ Authorization: "Bearer tok" }),
        })
      );
    });

    it("throws on non-ok with error and includes body", async () => {
      const errorBody = {
        success: false,
        slug: "",
        version: "",
        name: "",
        error: "Validation failed",
        details: ["Missing field X"],
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
      expect(err.body).toEqual(errorBody);
    });
  });

  // --- uploadToPresignedUrl ------------------------------------------------

  describe("uploadToPresignedUrl", () => {
    it("PUTs buffer to the given URL with gzip headers", async () => {
      const fetcher = mockFetch({});
      const client = new MarketplaceClient(SERVER);
      const buf = Buffer.from("data");

      await client.uploadToPresignedUrl("https://s3.example.com/upload", buf);

      expect(fetcher).toHaveBeenCalledWith(
        "https://s3.example.com/upload",
        expect.objectContaining({
          method: "PUT",
          headers: expect.objectContaining({
            "Content-Type": "application/gzip",
            "Content-Length": "4",
          }),
          body: buf,
        })
      );
    });

    it("throws MarketplaceApiError on non-ok response", async () => {
      mockFetch({ ok: false, status: 403 });
      const client = new MarketplaceClient(SERVER);

      await expect(
        client.uploadToPresignedUrl("https://s3.example.com/upload", Buffer.from(""))
      ).rejects.toThrow("Upload failed (403)");
    });
  });

  // --- downloadFromPresignedUrl --------------------------------------------

  describe("downloadFromPresignedUrl", () => {
    it("GETs the URL and returns a Buffer", async () => {
      const data = new ArrayBuffer(8);
      const fetcher = mockFetch({
        arrayBuffer: () => Promise.resolve(data),
      });
      const client = new MarketplaceClient(SERVER);

      const result = await client.downloadFromPresignedUrl("https://cdn.example.com/file.tar.gz");

      expect(Buffer.isBuffer(result)).toBe(true);
      expect(result.byteLength).toBe(8);
      expect(fetcher).toHaveBeenCalledWith("https://cdn.example.com/file.tar.gz");
    });

    it("throws MarketplaceApiError on non-ok response", async () => {
      mockFetch({ ok: false, status: 404 });
      const client = new MarketplaceClient(SERVER);

      await expect(
        client.downloadFromPresignedUrl("https://cdn.example.com/missing")
      ).rejects.toThrow("Download failed (404)");
    });
  });

  // --- MarketplaceApiError -------------------------------------------------

  describe("MarketplaceApiError", () => {
    it("extends Error with status and optional body", () => {
      const err = new MarketplaceApiError("fail", 404, { detail: "not found" });
      expect(err).toBeInstanceOf(Error);
      expect(err.message).toBe("fail");
      expect(err.status).toBe(404);
      expect(err.body).toEqual({ detail: "not found" });
    });
  });
});
