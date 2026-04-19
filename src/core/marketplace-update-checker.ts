import type { InstalledSkillRecord } from "./manifest.js";
import { createMarketplaceClient, type MarketplaceClient } from "./marketplace-client.js";

export interface MarketplaceUpdate {
  slug: string;
  currentVersion: string;
  latestVersion: string;
  currentHash: string;
  latestHash: string;
  changelog: string | null;
}

/**
 * Check for updates on marketplace-installed skills.
 * Queries GET /api/skills/[slug]/versions for each skill and compares
 * the installed version+hash against the latest.
 */
export async function checkMarketplaceUpdates(
  skills: InstalledSkillRecord[],
  options?: {
    server?: string;
    onProgress?: (checked: number, total: number) => void;
  },
): Promise<MarketplaceUpdate[]> {
  const client: MarketplaceClient = createMarketplaceClient(options?.server);
  const updates: MarketplaceUpdate[] = [];

  for (let i = 0; i < skills.length; i++) {
    const skill = skills[i];
    options?.onProgress?.(i + 1, skills.length);

    const slug = skill.marketplaceSlug;
    if (!slug) continue;

    try {
      const data = await client.getSkillVersions(slug);
      if (!data.versions || data.versions.length === 0) continue;

      const latest = data.versions.find((v) => v.isLatest) ?? data.versions[0];
      if (!latest.fileHash) continue;

      const currentHash = skill.commitHash || "";
      const currentVersion = skill.marketplaceVersion || "";

      // Update needed if hash differs (hash is the source of truth)
      if (latest.fileHash !== currentHash) {
        updates.push({
          slug,
          currentVersion,
          latestVersion: latest.version,
          currentHash,
          latestHash: latest.fileHash,
          changelog: latest.changelog,
        });
      }
    } catch {
      // Network error or API error for this skill — skip silently
    }
  }

  return updates;
}
