import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from "fs";
import { join, resolve, sep } from "path";

/**
 * Truncates a string to a maximum length, adding ellipsis if needed.
 * @param str - The string to truncate.
 * @param maxLength - Maximum length including ellipsis.
 * @returns The truncated string.
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 1) + "\u2026";
}

/**
 * Returns a scope label for display purposes.
 * @param scope - The installation scope.
 * @returns " (global)" for global scope, empty string otherwise.
 */
export function getScopeLabel(scope: "project" | "global" | undefined): string {
  return scope === "global" ? " (global)" : "";
}

export function ensureDir(dirPath: string): void {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
}

export function removeDir(dirPath: string): void {
  if (existsSync(dirPath)) {
    rmSync(dirPath, { recursive: true, force: true });
  }
}

export function isDirectory(path: string): boolean {
  return existsSync(path) && statSync(path).isDirectory();
}

/** Directories to skip during recursive skill discovery */
const SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  "__pycache__",
  ".venv",
  "venv",
  ".tox",
  "coverage",
  ".nyc_output",
]);

/**
 * Recursively finds all directories containing SKILL.md files.
 * @param basePath - The base directory to search from.
 * @param maxDepth - Maximum recursion depth (default: 10).
 * @returns Array of absolute paths to directories containing SKILL.md.
 */
export function findSkillDirs(basePath: string, maxDepth = 10): string[] {
  if (!existsSync(basePath)) {
    return [];
  }

  const results: string[] = [];

  function search(dir: string, depth: number): void {
    if (depth > maxDepth) return;

    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      // Permission denied or other I/O error, skip this directory
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      // Skip common non-skill directories
      if (SKIP_DIRS.has(entry.name)) continue;

      const fullPath = join(dir, entry.name);

      // Check if this directory contains a SKILL.md
      if (existsSync(join(fullPath, "SKILL.md"))) {
        results.push(fullPath);
        // Don't recurse into skill directories (skill found)
      } else {
        // Recurse into subdirectory
        search(fullPath, depth + 1);
      }
    }
  }

  search(basePath, 0);
  return results;
}

export function getProjectRoot(): string {
  return process.cwd();
}

/**
 * Checks if a target path is within a base path (prevents path traversal).
 * @param basePath - The base directory path.
 * @param targetPath - The path to check.
 * @returns True if targetPath is within basePath.
 */
export function isPathWithin(basePath: string, targetPath: string): boolean {
  const normalizedBase = resolve(basePath);
  const normalizedTarget = resolve(targetPath);
  return normalizedTarget === normalizedBase || normalizedTarget.startsWith(normalizedBase + sep);
}

/**
 * Safely joins a user-provided path to a base path (prevents path traversal).
 * @param basePath - The base directory path.
 * @param userPath - The user-provided relative path.
 * @returns The joined path, or null if path traversal was attempted.
 */
export function safeJoinPath(basePath: string, userPath: string): string | null {
  const joined = join(basePath, userPath);
  return isPathWithin(basePath, joined) ? joined : null;
}

/**
 * Validates repository path component names (owner/repo).
 * @param name - The name to validate.
 * @returns True if the name is valid.
 *
 * Allows alphanumeric, hyphen, underscore, dot. Max 100 chars.
 */
export function isValidRepoPathName(name: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name) && name.length <= 100;
}

/**
 * Validates local repository config names (e.g., "anthropic-official").
 * @param name - The name to validate.
 * @returns True if the name is valid.
 *
 * Only alphanumeric, dash, underscore allowed. Max 100 characters.
 */
export function isValidConfigRepoName(name: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(name) && name.length > 0 && name.length <= 100;
}

/**
 * Parsed Git repository URL information.
 */
export interface ParsedGitUrl {
  /** Git host (e.g., "github.com", "gitlab.com", "self-hosted.example.com") */
  host: string;
  /** Repository owner/namespace (e.g., "anthropics") */
  owner: string;
  /** Repository name (e.g., "skills") */
  repo: string;
  /** Optional subpath within repository */
  path?: string;
  /** Full clone URL */
  cloneUrl: string;
}

/**
 * Validates that a URL is a valid Git repository URL.
 * @param url - The URL to validate.
 * @returns True if the URL can be parsed as a valid Git URL.
 */
export function isValidGitUrl(url: string): boolean {
  return parseGitUrl(url) !== null;
}

/**
 * Parses a Git repository URL into its components.
 * @param url - The URL to parse (supports multiple formats).
 * @returns Parsed components, or null if invalid.
 *
 * Supported formats:
 * - HTTPS: https://github.com/owner/repo, https://gitlab.com/owner/repo
 * - SSH: git@github.com:owner/repo.git, git@gitlab.com:owner/repo.git
 * - Git protocol: git://example.com/owner/repo.git
 * - GitHub shorthand: owner/repo (assumes github.com)
 * - GitHub scheme: github:owner/repo
 * - With paths: https://github.com/owner/repo/tree/main/subpath
 */
export function parseGitUrl(url: string): ParsedGitUrl | null {
  // Ensure no newlines or other control characters (prevent injection)
  // eslint-disable-next-line no-control-regex
  if (/[\n\r\x00-\x1f]/.test(url)) {
    return null;
  }

  let match: RegExpMatchArray | null;

  // HTTPS URL: https://host/owner/repo[.git][/tree/branch/path]
  match = url.match(/^https?:\/\/([^/]+)\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/tree\/[^/]+\/(.+))?$/);
  if (match) {
    const host = match[1];
    const owner = match[2];
    const repo = match[3];
    if (!isValidRepoPathName(owner) || !isValidRepoPathName(repo)) {
      return null;
    }
    return {
      host,
      owner,
      repo,
      path: match[4],
      cloneUrl: `https://${host}/${owner}/${repo}.git`,
    };
  }

  // SSH URL: git@host:owner/repo.git
  match = url.match(/^git@([^:]+):([^/]+)\/([^/]+?)(?:\.git)?$/);
  if (match) {
    const host = match[1];
    const owner = match[2];
    const repo = match[3];
    if (!isValidRepoPathName(owner) || !isValidRepoPathName(repo)) {
      return null;
    }
    return {
      host,
      owner,
      repo,
      cloneUrl: `git@${host}:${owner}/${repo}.git`,
    };
  }

  // Git protocol: git://host/owner/repo.git
  match = url.match(/^git:\/\/([^/]+)\/([^/]+)\/([^/]+?)(?:\.git)?$/);
  if (match) {
    const host = match[1];
    const owner = match[2];
    const repo = match[3];
    if (!isValidRepoPathName(owner) || !isValidRepoPathName(repo)) {
      return null;
    }
    return {
      host,
      owner,
      repo,
      cloneUrl: `git://${host}/${owner}/${repo}.git`,
    };
  }

  // GitHub shorthand: github:owner/repo
  match = url.match(/^github:([^/]+)\/([^/]+)$/);
  if (match) {
    const owner = match[1];
    const repo = match[2];
    if (!isValidRepoPathName(owner) || !isValidRepoPathName(repo)) {
      return null;
    }
    return {
      host: "github.com",
      owner,
      repo,
      cloneUrl: `https://github.com/${owner}/${repo}.git`,
    };
  }

  // Simple owner/repo format (assumes GitHub)
  match = url.match(/^([^/]+)\/([^/]+)$/);
  if (match && !url.includes(":") && !url.includes(".")) {
    const owner = match[1];
    const repo = match[2];
    if (!isValidRepoPathName(owner) || !isValidRepoPathName(repo)) {
      return null;
    }
    return {
      host: "github.com",
      owner,
      repo,
      cloneUrl: `https://github.com/${owner}/${repo}.git`,
    };
  }

  return null;
}

// Legacy aliases for backward compatibility
/** @deprecated Use isValidRepoPathName instead */
export const isValidGitHubName = isValidRepoPathName;

/** @deprecated Use isValidGitUrl instead */
export function isValidGitHubUrl(url: string): boolean {
  const parsed = parseGitUrl(url);
  return parsed !== null && parsed.host === "github.com";
}

/** @deprecated Use parseGitUrl instead */
export function parseGitHubUrl(url: string): {
  owner: string;
  repo: string;
  path?: string;
} | null {
  const parsed = parseGitUrl(url);
  if (!parsed || parsed.host !== "github.com") return null;
  return { owner: parsed.owner, repo: parsed.repo, path: parsed.path };
}
