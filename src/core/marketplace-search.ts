import { createMarketplaceClient } from "./marketplace-client.js";

export interface MarketplaceSkillResult {
  slug: string;
  name: string;
  description: string;
  shortDescription: string | null;
  authorName: string | null;
  installCount: number;
  avgRating: string | null;
}

/**
 * Search the OpenSkill marketplace API.
 * Public endpoint — no auth required.
 */
export async function searchMarketplace(
  query: string,
  options?: { server?: string; limit?: number },
): Promise<MarketplaceSkillResult[]> {
  const client = createMarketplaceClient(options?.server);
  const data = await client.searchSkills(query, options?.limit);

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
