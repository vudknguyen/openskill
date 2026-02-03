import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock auth module
vi.mock("../core/auth.js", () => ({
  loadAuth: vi.fn(),
}));

// Mock config module
vi.mock("../core/config.js", () => ({
  loadConfig: vi.fn(),
}));

// Mock url utilities
vi.mock("../utils/url.js", () => ({
  validateServerUrl: vi.fn((url: string) => url),
}));

import { loadAuth } from "../core/auth.js";
import { loadConfig } from "../core/config.js";
import { searchMarketplace, type MarketplaceSkillResult } from "../core/marketplace-search.js";

const mockLoadAuth = vi.mocked(loadAuth);
const mockLoadConfig = vi.mocked(loadConfig);

function makeSearchResponse(skills: Array<{ name: string; slug: string; description: string }>) {
  return {
    skills: skills.map((s) => ({
      skill: {
        slug: s.slug,
        name: s.name,
        description: s.description,
        shortDescription: null,
        installCount: 42,
        avgRating: "4.5",
      },
      author: { name: "Test Author" },
    })),
    pagination: { total: skills.length },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();

  mockLoadAuth.mockReturnValue(null);
  mockLoadConfig.mockReturnValue({
    version: 3,
    defaultAgent: "claude",
    defaultScope: "project",
    serverUrl: "http://localhost:3000",
    repos: [],
    agents: {},
  });
});

describe("searchMarketplace", () => {
  it("sends search query to marketplace API and returns results", async () => {
    const apiResponse = makeSearchResponse([
      { name: "Deploy Tool", slug: "deploy-tool", description: "Deploys stuff" },
      { name: "Lint Helper", slug: "lint-helper", description: "Lints code" },
    ]);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(apiResponse),
      }),
    );

    const results = await searchMarketplace("deploy");

    expect(results).toHaveLength(2);
    expect(results[0].slug).toBe("deploy-tool");
    expect(results[0].name).toBe("Deploy Tool");
    expect(results[0].description).toBe("Deploys stuff");
    expect(results[0].authorName).toBe("Test Author");
    expect(results[0].installCount).toBe(42);
    expect(results[0].avgRating).toBe("4.5");
  });

  it("sends correct query and limit parameters", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ skills: [], pagination: { total: 0 } }),
      }),
    );

    await searchMarketplace("test-query", { limit: 10 });

    const fetchCall = vi.mocked(fetch).mock.calls[0][0] as string;
    expect(fetchCall).toContain("q=test-query");
    expect(fetchCall).toContain("limit=10");
  });

  it("uses default limit of 20 when not specified", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ skills: [], pagination: { total: 0 } }),
      }),
    );

    await searchMarketplace("query");

    const fetchCall = vi.mocked(fetch).mock.calls[0][0] as string;
    expect(fetchCall).toContain("limit=20");
  });

  it("uses server URL from auth data", async () => {
    mockLoadAuth.mockReturnValue({
      accessToken: "token",
      refreshToken: "refresh",
      serverUrl: "https://auth-server.example.com",
      createdAt: new Date().toISOString(),
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ skills: [], pagination: { total: 0 } }),
      }),
    );

    await searchMarketplace("query");

    const fetchCall = vi.mocked(fetch).mock.calls[0][0] as string;
    expect(fetchCall).toContain("https://auth-server.example.com");
  });

  it("uses custom server URL from options over auth/config", async () => {
    mockLoadAuth.mockReturnValue({
      accessToken: "token",
      refreshToken: "refresh",
      serverUrl: "https://auth-server.example.com",
      createdAt: new Date().toISOString(),
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ skills: [], pagination: { total: 0 } }),
      }),
    );

    await searchMarketplace("query", { server: "https://custom.server.com" });

    const fetchCall = vi.mocked(fetch).mock.calls[0][0] as string;
    expect(fetchCall).toContain("https://custom.server.com");
  });

  it("falls back to config serverUrl when no auth", async () => {
    mockLoadAuth.mockReturnValue(null);
    mockLoadConfig.mockReturnValue({
      version: 3,
      defaultAgent: "claude",
      defaultScope: "project",
      serverUrl: "https://config-server.example.com",
      repos: [],
      agents: {},
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ skills: [], pagination: { total: 0 } }),
      }),
    );

    await searchMarketplace("query");

    const fetchCall = vi.mocked(fetch).mock.calls[0][0] as string;
    expect(fetchCall).toContain("https://config-server.example.com");
  });

  it("throws when API returns non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      }),
    );

    await expect(searchMarketplace("query")).rejects.toThrow(
      "Marketplace search failed (500)",
    );
  });

  it("throws when API returns 404", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      }),
    );

    await expect(searchMarketplace("query")).rejects.toThrow(
      "Marketplace search failed (404)",
    );
  });

  it("returns empty array when no skills match", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ skills: [], pagination: { total: 0 } }),
      }),
    );

    const results = await searchMarketplace("nonexistent-skill");

    expect(results).toEqual([]);
  });

  it("handles null author gracefully", async () => {
    const apiResponse = {
      skills: [
        {
          skill: {
            slug: "orphan-skill",
            name: "Orphan Skill",
            description: "Has no author",
            shortDescription: null,
            installCount: 0,
            avgRating: null,
          },
          author: null,
        },
      ],
      pagination: { total: 1 },
    };

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(apiResponse),
      }),
    );

    const results = await searchMarketplace("orphan");

    expect(results).toHaveLength(1);
    expect(results[0].authorName).toBeNull();
  });

  it("maps all response fields correctly", async () => {
    const apiResponse = {
      skills: [
        {
          skill: {
            slug: "full-skill",
            name: "Full Skill",
            description: "Complete description",
            shortDescription: "Short desc",
            installCount: 1234,
            avgRating: "4.8",
          },
          author: { name: "Skilled Author" },
        },
      ],
      pagination: { total: 1 },
    };

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(apiResponse),
      }),
    );

    const results = await searchMarketplace("full");

    const result = results[0];
    expect(result.slug).toBe("full-skill");
    expect(result.name).toBe("Full Skill");
    expect(result.description).toBe("Complete description");
    expect(result.shortDescription).toBe("Short desc");
    expect(result.authorName).toBe("Skilled Author");
    expect(result.installCount).toBe(1234);
    expect(result.avgRating).toBe("4.8");
  });

  it("URL-encodes the search query parameter", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ skills: [], pagination: { total: 0 } }),
      }),
    );

    await searchMarketplace("deploy aws");

    const fetchCall = vi.mocked(fetch).mock.calls[0][0] as string;
    // URLSearchParams encodes spaces as +
    expect(fetchCall).toContain("q=deploy+aws");
  });
});
