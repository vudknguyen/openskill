import { readFileSync, existsSync } from "fs";
import { join, basename, relative } from "path";
import { parseSkillMd, ParsedSkill } from "../utils/markdown.js";
import { findSkillDirs, safeJoinPath } from "../utils/fs.js";

export interface SkillInfo {
  name: string;
  description: string;
  /** Absolute path to the skill directory */
  path: string;
  /** Relative path from repository root (e.g., "skills/my-skill" or ".curated/my-skill") */
  relativePath: string;
  license?: string;
  compatibility?: string;
  metadata?: Record<string, string>;
}

export function loadSkillFromDir(skillDir: string): ParsedSkill | null {
  const skillMdPath = join(skillDir, "SKILL.md");

  if (!existsSync(skillMdPath)) {
    return null;
  }

  try {
    const content = readFileSync(skillMdPath, "utf-8");
    return parseSkillMd(content);
  } catch {
    // Handle permission errors, I/O errors, or parse errors gracefully
    return null;
  }
}

/**
 * Loads skill info from a directory.
 * @param skillDir - Absolute path to the skill directory.
 * @param basePath - Optional base path for computing relative paths.
 * @returns SkillInfo or null if invalid.
 */
export function loadSkillInfo(skillDir: string, basePath?: string): SkillInfo | null {
  const skill = loadSkillFromDir(skillDir);
  if (!skill) return null;

  // Compute relative path from base, or use directory name as fallback
  const relativePath = basePath ? relative(basePath, skillDir) : basename(skillDir);

  return {
    name: skill.frontmatter.name,
    description: skill.frontmatter.description,
    path: skillDir,
    relativePath,
    license: skill.frontmatter.license,
    compatibility: skill.frontmatter.compatibility,
    metadata: skill.frontmatter.metadata,
  };
}

/**
 * Discovers all skills in a directory (recursively).
 * @param basePath - The base directory to search from.
 * @returns Array of SkillInfo with relative paths from basePath.
 */
export function discoverSkills(basePath: string): SkillInfo[] {
  const skillDirs = findSkillDirs(basePath);
  const skills: SkillInfo[] = [];

  for (const dir of skillDirs) {
    const info = loadSkillInfo(dir, basePath);
    if (info) {
      skills.push(info);
    }
  }

  return skills;
}

export function findSkillByName(basePath: string, name: string): SkillInfo | null {
  const skills = discoverSkills(basePath);
  return skills.find((s) => s.name === name) || null;
}

export function validateSkillName(name: string): {
  valid: boolean;
  error?: string;
} {
  if (!name || name.length === 0) {
    return { valid: false, error: "Name cannot be empty" };
  }

  if (name.length > 64) {
    return { valid: false, error: "Name must be 64 characters or less" };
  }

  if (!/^[a-z][a-z0-9-]*[a-z0-9]$|^[a-z]$/.test(name)) {
    return {
      valid: false,
      error: "Name must be lowercase letters, numbers, and hyphens; cannot start/end with hyphen",
    };
  }

  if (name.includes("--")) {
    return { valid: false, error: "Name cannot contain consecutive hyphens" };
  }

  return { valid: true };
}

export function validateSkillDescription(description: string): {
  valid: boolean;
  error?: string;
} {
  if (!description || description.length === 0) {
    return { valid: false, error: "Description cannot be empty" };
  }

  if (description.length > 1024) {
    return { valid: false, error: "Description must be 1024 characters or less" };
  }

  return { valid: true };
}

export function extractSkillFromRepoPath(repoPath: string, skillPath?: string): string | null {
  // If a specific skill path is given, use it
  if (skillPath) {
    const fullPath = safeJoinPath(repoPath, skillPath);
    if (!fullPath) {
      return null; // Invalid path (traversal attempt)
    }
    if (existsSync(join(fullPath, "SKILL.md"))) {
      return fullPath;
    }
    return null;
  }

  // Otherwise, look for skills directory or skill at root
  const skillsDir = join(repoPath, "skills");
  if (existsSync(skillsDir)) {
    return skillsDir;
  }

  // Check if root is a skill
  if (existsSync(join(repoPath, "SKILL.md"))) {
    return repoPath;
  }

  return null;
}
