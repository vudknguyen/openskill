import { loadAuth } from "./auth.js";
import { validateServerUrl } from "../utils/url.js";

export interface MarketplaceSkillResult {
  slug: string;
  name: string;
  description: string;
  shortDescription: string | null;
  authorName: string | null;
  installCount: number;
  avgRating: string | null;
}

interface MarketplaceSearchResponse {
  skills: Array<{
    skill: {
      slug: string;
      name: string;
      description: string;
      shortDescription: string | null;
      installCount: number;
      avgRating: string | null;
    };
    author: { name: string } | null;
  }>;
  pagination: { total: number };
}

/**
 * Search the OpenSkill marketplace API.
 * Public endpoint — no auth required.
 */
export async function searchMarketplace(
  query: string,
  options?: { server?: string; limit?: number },
): Promise<MarketplaceSkillResult[]> {
  const auth = loadAuth();
  const serverUrl = validateServerUrl(options?.server || auth?.serverUrl || "http://localhost:3000");
  const limit = options?.limit ?? 20;

  const params = new URLSearchParams({ q: query, limit: String(limit) });
  const res = await fetch(`${serverUrl}/api/skills?${params}`);

  if (!res.ok) {
    throw new Error(`Marketplace search failed (${res.status})`);
  }

  const data = (await res.json()) as MarketplaceSearchResponse;

  return data.skills.map(({ skill, author }) => ({
    slug: skill.slug,
    name: skill.name,
    description: skill.description,
    shortDescription: skill.shortDescription,
    authorName: author?.name ?? null,
    installCount: skill.installCount,
    avgRating: skill.avgRating,
  }));
}
