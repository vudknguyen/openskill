import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { getReposCacheDir, loadConfig } from "./config.js";
import { updateRepo } from "./git.js";
import { discoverSkills, SkillInfo } from "./skill.js";
import { parseGitUrl, isPathWithin, isValidConfigRepoName } from "../utils/fs.js";
import { logger } from "../utils/logger.js";

export interface RepoSkill extends SkillInfo {
  /** Config name/alias (e.g., "anthropic-official") */
  repo: string;
  /** Repository owner/namespace (e.g., "anthropics") */
  repoOwner: string;
  /** Repository name (e.g., "skills") */
  repoName: string;
  /** Relative path from repo root to skill (e.g., ".curated/my-skill" or "skills/my-skill") */
  skillPath: string;
}

export interface RepoCache {
  lastUpdated: string;
  skills: RepoSkill[];
}

function getCachePath(repoName: string): string {
  // Validate repo name to prevent path traversal
  if (!isValidConfigRepoName(repoName)) {
    throw new Error(`Invalid repository name: ${repoName}`);
  }
  const cachePath = join(getReposCacheDir(), `${repoName}.json`);
  // Double-check path is within cache directory
  if (!isPathWithin(getReposCacheDir(), cachePath)) {
    throw new Error(`Invalid cache path for repository: ${repoName}`);
  }
  return cachePath;
}

export async function refreshRepo(name: string, url: string): Promise<RepoSkill[]> {
  const parsed = parseGitUrl(url);
  if (!parsed) {
    throw new Error(`Invalid repository URL: ${url}`);
  }

  const { owner, repo, cloneUrl } = parsed;

  // Clone or update the repo
  const updateResult = await updateRepo(owner, repo, cloneUrl);
  if (!updateResult.success) {
    throw new Error(`Failed to fetch repository: ${updateResult.error}`);
  }

  // Discover skills in the repo (search from root recursively)
  const repoPath = join(getReposCacheDir(), "..", "skills", `${owner}-${repo}`);

  // Search recursively from repository root
  const skills = discoverSkills(repoPath);
  const repoSkills: RepoSkill[] = skills.map((skill) => ({
    ...skill,
    repo: name,
    repoOwner: owner,
    repoName: repo,
    // Use relativePath from skill discovery as the skillPath
    skillPath: skill.relativePath,
  }));

  // Cache the results
  const cache: RepoCache = {
    lastUpdated: new Date().toISOString(),
    skills: repoSkills,
  };
  writeFileSync(getCachePath(name), JSON.stringify(cache, null, 2));

  return repoSkills;
}

/**
 * Loads cached skills for a repository from disk.
 * @param name - The repository config name (e.g., "anthropic-official").
 * @returns Array of cached skills, or empty array if cache doesn't exist.
 *
 * Convention: "load" prefix for disk I/O, "get" prefix for in-memory lookups.
 */
export function loadRepoCache(name: string): RepoSkill[] {
  const cachePath = getCachePath(name);
  if (!existsSync(cachePath)) {
    return [];
  }

  try {
    const content = readFileSync(cachePath, "utf-8");
    const cache: RepoCache = JSON.parse(content);
    // Validate structure
    if (!cache.skills || !Array.isArray(cache.skills)) {
      return [];
    }
    return cache.skills;
  } catch {
    // Corrupted cache, return empty
    return [];
  }
}

export async function searchSkills(query: string): Promise<RepoSkill[]> {
  const config = loadConfig();
  const allSkills: RepoSkill[] = [];

  for (const repo of config.repos) {
    let skills = loadRepoCache(repo.name);

    // If cache is empty, refresh
    if (skills.length === 0) {
      try {
        skills = await refreshRepo(repo.name, repo.url);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.warn(`Failed to refresh ${repo.name}: ${message}`);
        continue;
      }
    }

    allSkills.push(...skills);
  }

  const lowerQuery = query.toLowerCase();
  return allSkills.filter(
    (skill) =>
      skill.name.toLowerCase().includes(lowerQuery) ||
      skill.description.toLowerCase().includes(lowerQuery)
  );
}

export interface RefreshResult {
  succeeded: string[];
  failed: Array<{ repo: string; error: string }>;
}

export async function refreshAllRepos(): Promise<RefreshResult> {
  const config = loadConfig();
  const succeeded: string[] = [];
  const failed: Array<{ repo: string; error: string }> = [];

  for (const repo of config.repos) {
    try {
      await refreshRepo(repo.name, repo.url);
      succeeded.push(repo.name);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      failed.push({ repo: repo.name, error: message });
    }
  }

  return { succeeded, failed };
}

export function getSkillFromRepo(repoName: string, skillName: string): RepoSkill | null {
  const skills = loadRepoCache(repoName);
  return skills.find((s) => s.name === skillName) || null;
}

export interface RepoInfo {
  name: string;
  url: string;
  skillCount: number;
  lastUpdated: string | null;
}

export function getRepoInfo(name: string, url: string): RepoInfo {
  const cachePath = getCachePath(name);
  let skillCount = 0;
  let lastUpdated: string | null = null;

  if (existsSync(cachePath)) {
    try {
      const content = readFileSync(cachePath, "utf-8");
      const cache: RepoCache = JSON.parse(content);
      if (cache.skills && Array.isArray(cache.skills)) {
        skillCount = cache.skills.length;
      }
      if (cache.lastUpdated) {
        lastUpdated = cache.lastUpdated;
      }
    } catch {
      // Corrupted cache, use defaults
    }
  }

  return { name, url, skillCount, lastUpdated };
}

export function getAllRepoSkills(): RepoSkill[] {
  const config = loadConfig();
  const allSkills: RepoSkill[] = [];

  for (const repo of config.repos) {
    const skills = loadRepoCache(repo.name);
    allSkills.push(...skills);
  }

  return allSkills;
}
