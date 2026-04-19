import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock marketplace client
const { mockSearchSkills, mockCreateMarketplaceClient } = vi.hoisted(() => {
  const mockSearchSkills = vi.fn();
  return {
    mockSearchSkills,
    mockCreateMarketplaceClient: vi.fn().mockReturnValue({
      searchSkills: mockSearchSkills,
    }),
  };
});

vi.mock("../core/marketplace-client.js", () => ({
  createMarketplaceClient: mockCreateMarketplaceClient,
}));

import { searchMarketplace } from "../core/marketplace-search.js";

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
});

describe("searchMarketplace", () => {
  it("returns mapped results from client.searchSkills", async () => {
    const apiResponse = makeSearchResponse([
      { name: "Deploy Tool", slug: "deploy-tool", description: "Deploys stuff" },
      { name: "Lint Helper", slug: "lint-helper", description: "Lints code" },
    ]);
    mockSearchSkills.mockResolvedValue(apiResponse);

    const results = await searchMarketplace("deploy");

    expect(results).toHaveLength(2);
    expect(results[0].slug).toBe("deploy-tool");
    expect(results[0].name).toBe("Deploy Tool");
    expect(results[0].description).toBe("Deploys stuff");
    expect(results[0].authorName).toBe("Test Author");
    expect(results[0].installCount).toBe(42);
    expect(results[0].avgRating).toBe("4.5");
  });

  it("passes query and limit to client.searchSkills", async () => {
    mockSearchSkills.mockResolvedValue({ skills: [], pagination: { total: 0 } });

    await searchMarketplace("test-query", { limit: 10 });

    expect(mockSearchSkills).toHaveBeenCalledWith("test-query", 10);
  });

  it("passes undefined limit when not specified", async () => {
    mockSearchSkills.mockResolvedValue({ skills: [], pagination: { total: 0 } });

    await searchMarketplace("query");

    expect(mockSearchSkills).toHaveBeenCalledWith("query", undefined);
  });

  it("passes server override to createMarketplaceClient", async () => {
    mockSearchSkills.mockResolvedValue({ skills: [], pagination: { total: 0 } });

    await searchMarketplace("query", { server: "https://custom.server.com" });

    expect(mockCreateMarketplaceClient).toHaveBeenCalledWith("https://custom.server.com");
  });

  it("passes undefined server when no override", async () => {
    mockSearchSkills.mockResolvedValue({ skills: [], pagination: { total: 0 } });

    await searchMarketplace("query");

    expect(mockCreateMarketplaceClient).toHaveBeenCalledWith(undefined);
  });

  it("propagates errors from client.searchSkills", async () => {
    mockSearchSkills.mockRejectedValue(new Error("Marketplace search failed (500)"));

    await expect(searchMarketplace("query")).rejects.toThrow("Marketplace search failed (500)");
  });

  it("returns empty array when no skills match", async () => {
    mockSearchSkills.mockResolvedValue({ skills: [], pagination: { total: 0 } });

    const results = await searchMarketplace("nonexistent-skill");

    expect(results).toEqual([]);
  });

  it("handles null author gracefully", async () => {
    mockSearchSkills.mockResolvedValue({
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
    });

    const results = await searchMarketplace("orphan");

    expect(results).toHaveLength(1);
    expect(results[0].authorName).toBeNull();
  });

  it("maps all response fields correctly", async () => {
    mockSearchSkills.mockResolvedValue({
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
    });

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
});
