import { createMarketplaceClient } from "./marketplace-client.js";

export interface MarketplaceSkillResult {
  slug: string;
  name: string;
  description: string;
  shortDescription: string | null;
  authorName: string | null;
  installCount: number;
  avgRating: string | null;
  tags: string | null;
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
    tags: skill.tags,
  }));
}

export interface DiscoveredSkillResult {
  source: "openskill" | "github";
  slug: string;
  name: string;
  description: string;
  shortDescription: string | null;
  authorName: string | null;
  installCount: number | null;
  avgRating: string | null;
  tags: string | null;
  auditStatus: "pass" | "warning" | "fail" | "unscanned" | null;
  // GitHub-specific
  stars: number | null;
  repoUrl: string | null;
  repoFullName: string | null;
  skillPath: string | null;
  defaultBranch: string | null;
}

/**
 * Search the OpenSkill discovery endpoint which returns both
 * marketplace AND GitHub-discovered skills in a unified view.
 */
export async function discoverSkills(
  query: string,
  options?: { server?: string; limit?: number },
): Promise<DiscoveredSkillResult[]> {
  const client = createMarketplaceClient(options?.server);
  const data = await client.discoverSkills(query, { limit: options?.limit });
  return data.skills.map((s) => ({
    source: s.source,
    slug: s.slug,
    name: s.name,
    description: s.description,
    shortDescription: s.shortDescription ?? null,
    authorName: s.authorName ?? null,
    installCount: s.installCount ?? null,
    avgRating: s.avgRating ?? null,
    tags: s.tags ?? null,
    auditStatus: s.auditStatus ?? null,
    stars: s.stars ?? null,
    repoUrl: s.repoUrl ?? null,
    repoFullName: s.repoFullName ?? null,
    skillPath: s.skillPath ?? null,
    defaultBranch: s.defaultBranch ?? null,
  }));
}
