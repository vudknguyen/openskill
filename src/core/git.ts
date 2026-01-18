import { execFileSync } from "child_process";
import { existsSync } from "fs";
import { join } from "path";
import { getSkillsCacheDir } from "./config.js";
import { ensureDir, isPathWithin, isValidRepoPathName, type ParsedGitUrl } from "../utils/fs.js";

let gitChecked = false;

function ensureGitInstalled(): void {
  if (gitChecked) return;

  try {
    execFileSync("git", ["--version"], { stdio: "pipe" });
    gitChecked = true;
  } catch {
    throw new Error(
      "Git is not installed or not in PATH. Please install git to use this feature.\n" +
        "  macOS: brew install git\n" +
        "  Ubuntu/Debian: sudo apt install git\n" +
        "  Windows: https://git-scm.com/download/win"
    );
  }
}

/**
 * Validates a git commit hash (full or short form).
 * @param hash - The hash string to validate (4-40 hex characters).
 * @returns True if the hash is valid.
 */
function isValidCommitHash(hash: string): boolean {
  // Git commit hashes are 4-40 hex characters
  return /^[a-fA-F0-9]{4,40}$/.test(hash);
}

function validateOwnerRepo(owner: string, repo: string): void {
  if (!isValidRepoPathName(owner)) {
    throw new Error(`Invalid repository owner name: ${owner}`);
  }
  if (!isValidRepoPathName(repo)) {
    throw new Error(`Invalid repository name: ${repo}`);
  }
}

// Re-export ParsedGitUrl for consumers
export type { ParsedGitUrl };

export interface CloneResult {
  success: boolean;
  path: string;
  error?: string;
}

export interface UpdateResult {
  success: boolean;
  updated: boolean;
  previousCommit?: string;
  currentCommit?: string;
  error?: string;
}

function getRepoLocalPath(owner: string, repo: string): string {
  return join(getSkillsCacheDir(), `${owner}-${repo}`);
}

function runGit(
  args: string[],
  cwd?: string
): { success: boolean; output: string; error?: string } {
  try {
    const output = execFileSync("git", args, {
      cwd,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { success: true, output: output.trim() };
  } catch (err) {
    const error = err as { stderr?: string; message?: string };
    return {
      success: false,
      output: "",
      error: error.stderr || error.message || String(err),
    };
  }
}

/**
 * Clone a Git repository.
 * @param owner - Repository owner/namespace.
 * @param repo - Repository name.
 * @param cloneUrl - Optional clone URL. If not provided, defaults to GitHub.
 * @returns Clone result with path and status.
 */
export async function cloneRepo(
  owner: string,
  repo: string,
  cloneUrl?: string
): Promise<CloneResult> {
  ensureGitInstalled();
  validateOwnerRepo(owner, repo);

  const localPath = getRepoLocalPath(owner, repo);

  // Ensure localPath is within skills cache directory
  const cacheDir = getSkillsCacheDir();
  if (!isPathWithin(cacheDir, localPath)) {
    return { success: false, path: localPath, error: "Invalid repository path" };
  }

  // Use provided URL or construct GitHub URL as fallback
  const repoUrl = cloneUrl || `https://github.com/${owner}/${repo}.git`;

  if (existsSync(localPath)) {
    return { success: true, path: localPath };
  }

  ensureDir(getSkillsCacheDir());

  const result = runGit(["clone", "--depth", "1", repoUrl, localPath]);

  if (result.success) {
    return { success: true, path: localPath };
  }

  return { success: false, path: localPath, error: result.error };
}

/**
 * Update a Git repository (pull latest changes).
 * @param owner - Repository owner/namespace.
 * @param repo - Repository name.
 * @param cloneUrl - Optional clone URL for initial clone. If not provided, defaults to GitHub.
 * @returns Update result with status.
 */
export async function updateRepo(
  owner: string,
  repo: string,
  cloneUrl?: string
): Promise<UpdateResult> {
  ensureGitInstalled();
  validateOwnerRepo(owner, repo);
  const localPath = getRepoLocalPath(owner, repo);

  if (!existsSync(localPath)) {
    const cloneResult = await cloneRepo(owner, repo, cloneUrl);
    if (!cloneResult.success) {
      return { success: false, updated: false, error: cloneResult.error };
    }
    return { success: true, updated: true };
  }

  // Get current commit
  const prevCommit = runGit(["rev-parse", "HEAD"], localPath);
  const previousCommit = prevCommit.success ? prevCommit.output : undefined;

  // Pull updates
  const pullResult = runGit(["pull"], localPath);
  if (!pullResult.success) {
    return { success: false, updated: false, error: pullResult.error };
  }

  // Get new commit
  const newCommit = runGit(["rev-parse", "HEAD"], localPath);
  const currentCommit = newCommit.success ? newCommit.output : undefined;

  return {
    success: true,
    updated: previousCommit !== currentCommit,
    previousCommit,
    currentCommit,
  };
}

export async function getRepoCommit(owner: string, repo: string): Promise<string | null> {
  const localPath = getRepoLocalPath(owner, repo);

  if (!existsSync(localPath)) {
    return null;
  }

  const result = runGit(["rev-parse", "--short", "HEAD"], localPath);
  return result.success ? result.output : null;
}

export function getCachedRepoPath(owner: string, repo: string): string | null {
  const localPath = getRepoLocalPath(owner, repo);
  return existsSync(localPath) ? localPath : null;
}

export function getCommitMessages(
  owner: string,
  repo: string,
  fromCommit: string,
  toCommit: string,
  limit = 5
): string[] {
  // Validate inputs to prevent command injection
  validateOwnerRepo(owner, repo);

  if (!isValidCommitHash(fromCommit) || !isValidCommitHash(toCommit)) {
    return []; // Invalid commit hash, return empty instead of throwing
  }

  // Validate limit parameter to prevent command injection
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    limit = 5; // Safe default
  }

  const localPath = getRepoLocalPath(owner, repo);

  if (!existsSync(localPath)) {
    return [];
  }

  // Get commit messages between two commits
  const result = runGit(["log", "--oneline", `${fromCommit}..${toCommit}`, `-${limit}`], localPath);

  if (!result.success || !result.output) {
    return [];
  }

  return result.output.split("\n").filter(Boolean);
}
