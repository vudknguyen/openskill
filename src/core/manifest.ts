import { existsSync, readFileSync, writeFileSync, renameSync, unlinkSync } from "fs";
import { join } from "path";
import { getConfigDir, ensureConfigDir } from "./config.js";
import { InstallScope } from "../agents/types.js";

export interface InstalledSkillRecord {
  /** Skill name */
  name: string;
  /** Target agent (e.g., "claude", "cursor") */
  agent: string;
  /** Repository owner/namespace (e.g., "anthropics") */
  repoOwner: string;
  /** Repository name (e.g., "skills") */
  repoName: string;
  /** Path within repository to skill */
  repoPath?: string;
  /** Git commit hash at install time */
  commitHash: string;
  /** ISO timestamp of installation */
  installedAt: string;
  /** Install scope (project or global) */
  scope?: InstallScope;
}

export interface Manifest {
  version: number;
  skills: InstalledSkillRecord[];
}

/**
 * Manifest version for migration support.
 * Increment when manifest schema changes.
 */
export const MANIFEST_VERSION = 1;
const LOCK_TIMEOUT_MS = 5000;
const LOCK_RETRY_MS = 50;
const LOCK_STALE_MS = 30000; // Consider lock stale after 30 seconds

interface LockInfo {
  pid: number;
  timestamp: number;
}

function getManifestPath(): string {
  return join(getConfigDir(), "manifest.json");
}

function getLockPath(): string {
  return join(getConfigDir(), "manifest.lock");
}

function parseLockInfo(content: string): LockInfo | null {
  try {
    const parsed = JSON.parse(content);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof parsed.pid === "number" &&
      typeof parsed.timestamp === "number"
    ) {
      return parsed as LockInfo;
    }
  } catch {
    // Invalid JSON, try legacy format (just PID)
    const pid = parseInt(content, 10);
    if (!isNaN(pid) && pid > 0) {
      return { pid, timestamp: 0 }; // Legacy lock, treat as possibly stale
    }
  }
  return null;
}

function isLockStale(lockInfo: LockInfo): boolean {
  // If timestamp is 0 (legacy), consider it potentially stale
  if (lockInfo.timestamp === 0) {
    return true;
  }
  // Lock is stale if it's older than LOCK_STALE_MS
  return Date.now() - lockInfo.timestamp > LOCK_STALE_MS;
}

function isProcessRunning(pid: number): boolean {
  try {
    // process.kill(pid, 0) doesn't throw on Windows even for dead processes
    // So we also check if the PID is valid (positive integer)
    if (pid <= 0) return false;

    // On Windows, process.kill(pid, 0) always succeeds for any valid PID format
    // We rely more on timestamp-based stale detection for Windows compatibility
    if (process.platform === "win32") {
      // On Windows, just check if PID looks valid - stale detection handles the rest
      return pid > 0 && pid < 4194304; // Max PID on Windows
    }

    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function sleepSync(ms: number): void {
  // Use a less CPU-intensive sync sleep via Atomics.wait
  // Falls back to Date.now loop if SharedArrayBuffer is unavailable
  try {
    const buffer = new SharedArrayBuffer(4);
    const view = new Int32Array(buffer);
    Atomics.wait(view, 0, 0, ms);
  } catch {
    // Fallback for environments without SharedArrayBuffer
    const end = Date.now() + ms;
    while (Date.now() < end) {
      // Minimal busy wait
    }
  }
}

function acquireLock(): boolean {
  const lockPath = getLockPath();
  const startTime = Date.now();

  while (Date.now() - startTime < LOCK_TIMEOUT_MS) {
    try {
      // Create lock info with PID and timestamp
      const lockInfo: LockInfo = {
        pid: process.pid,
        timestamp: Date.now(),
      };
      // Try to create lock file exclusively with atomic content
      writeFileSync(lockPath, JSON.stringify(lockInfo), { flag: "wx" });
      return true;
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === "EEXIST") {
        // Lock exists, check if stale
        try {
          const content = readFileSync(lockPath, "utf-8");
          const lockInfo = parseLockInfo(content);

          if (lockInfo) {
            // If it's our own PID, we already hold the lock
            if (lockInfo.pid === process.pid) {
              return true;
            }

            // Check if lock holder is still running
            const processAlive = isProcessRunning(lockInfo.pid);

            // Lock is stale if process is dead OR lock is older than stale timeout
            if (!processAlive || isLockStale(lockInfo)) {
              // Remove stale lock and immediately try to acquire
              try {
                unlinkSync(lockPath);
                // Immediately try to create our lock (reduces race window)
                const newLockInfo: LockInfo = {
                  pid: process.pid,
                  timestamp: Date.now(),
                };
                writeFileSync(lockPath, JSON.stringify(newLockInfo), { flag: "wx" });
                return true;
              } catch {
                // Another process beat us to it, continue retry loop
                continue;
              }
            }
          } else {
            // Invalid lock content, remove it
            try {
              unlinkSync(lockPath);
            } catch {
              // Ignore
            }
            continue;
          }
        } catch {
          // Can't read lock, try to remove it
          try {
            unlinkSync(lockPath);
          } catch {
            // Ignore
          }
          continue;
        }
        // Wait and retry using less CPU-intensive sleep
        sleepSync(LOCK_RETRY_MS);
      } else {
        // Other error (like ENOENT for parent dir), ensure config dir exists
        ensureConfigDir();
      }
    }
  }
  return false;
}

function releaseLock(): void {
  try {
    unlinkSync(getLockPath());
  } catch {
    // Ignore errors on release
  }
}

function withLock<T>(fn: () => T): T {
  if (!acquireLock()) {
    throw new Error("Could not acquire manifest lock - another operation may be in progress");
  }
  try {
    return fn();
  } finally {
    releaseLock();
  }
}

export function loadManifest(): Manifest {
  const path = getManifestPath();
  if (!existsSync(path)) {
    return { version: MANIFEST_VERSION, skills: [] };
  }

  try {
    const content = readFileSync(path, "utf-8");
    const parsed = JSON.parse(content) as Manifest;
    // Validate structure
    if (typeof parsed.version !== "number" || !Array.isArray(parsed.skills)) {
      return { version: MANIFEST_VERSION, skills: [] };
    }

    // Migrate to latest version if needed
    if (parsed.version < MANIFEST_VERSION) {
      const migrated = migrateManifest(parsed);
      saveManifest(migrated);
      return migrated;
    }

    return parsed;
  } catch {
    // Corrupted manifest, return empty
    return { version: MANIFEST_VERSION, skills: [] };
  }
}

/**
 * Migrates a manifest to the latest version.
 * Add version-specific migrations here as needed.
 * @param manifest - The manifest to migrate.
 * @returns The migrated manifest.
 */
function migrateManifest(manifest: Manifest): Manifest {
  const current = { ...manifest };

  // Add version-specific migrations here as needed
  // Example: if (current.version === 1) { ... migrate to v2 ... current.version = 2; }

  // Update to latest version
  current.version = MANIFEST_VERSION;
  return current;
}

export function saveManifest(manifest: Manifest): void {
  ensureConfigDir();
  const path = getManifestPath();
  const tempPath = path + ".tmp";

  // Write to temp file first
  writeFileSync(tempPath, JSON.stringify(manifest, null, 2), "utf-8");

  // Atomic rename
  renameSync(tempPath, path);
}

export function addSkillRecord(record: InstalledSkillRecord): void {
  withLock(() => {
    const manifest = loadManifest();
    const scope = record.scope ?? "project";

    // Remove existing record for same skill+agent+scope combo
    manifest.skills = manifest.skills.filter(
      (s) =>
        !(s.name === record.name && s.agent === record.agent && (s.scope ?? "project") === scope)
    );

    manifest.skills.push(record);
    saveManifest(manifest);
  });
}

export function removeSkillRecord(
  name: string,
  agent: string,
  scope: InstallScope = "project"
): void {
  withLock(() => {
    const manifest = loadManifest();
    manifest.skills = manifest.skills.filter(
      (s) => !(s.name === name && s.agent === agent && (s.scope ?? "project") === scope)
    );
    saveManifest(manifest);
  });
}

export function getSkillRecord(
  name: string,
  agent: string,
  scope?: InstallScope
): InstalledSkillRecord | undefined {
  const manifest = loadManifest();
  if (scope) {
    return manifest.skills.find(
      (s) => s.name === name && s.agent === agent && (s.scope ?? "project") === scope
    );
  }
  return manifest.skills.find((s) => s.name === name && s.agent === agent);
}

export function getSkillsByAgent(agent: string): InstalledSkillRecord[] {
  const manifest = loadManifest();
  return manifest.skills.filter((s) => s.agent === agent);
}

export function getAllInstalledSkills(): InstalledSkillRecord[] {
  const manifest = loadManifest();
  return manifest.skills;
}
