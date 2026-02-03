import { createReadStream, existsSync, readFileSync, statSync } from "fs";
import { join, basename } from "path";
import { createHash } from "crypto";
import * as tar from "tar";
import { tmpdir } from "os";
import { writeFileSync, mkdirSync, unlinkSync } from "fs";

// Patterns to exclude when packaging a skill directory
const EXCLUDE_PATTERNS = [
  ".git",
  "node_modules",
  ".env",
  ".env.*",
  "*.log",
  "dist",
  "build",
  ".DS_Store",
  "__pycache__",
  ".venv",
  "*.pyc",
];

/**
 * Package a skill directory into a tar.gz buffer.
 * Validates SKILL.md exists before packaging.
 * @param skillDir - Absolute path to the skill directory.
 * @returns Buffer containing the tar.gz archive.
 */
export async function packageSkill(skillDir: string): Promise<Buffer> {
  const skillMdPath = join(skillDir, "SKILL.md");
  if (!existsSync(skillMdPath)) {
    throw new Error(`No SKILL.md found in ${skillDir}`);
  }

  // Create tar.gz to a temp file then read into buffer
  const tempDir = join(tmpdir(), `osk-pkg-${Date.now()}`);
  mkdirSync(tempDir, { recursive: true });
  const tarPath = join(tempDir, "skill.tar.gz");

  try {
    await tar.create(
      {
        gzip: true,
        file: tarPath,
        cwd: skillDir,
        filter: (path) => {
          // Check each exclude pattern against the path
          for (const pattern of EXCLUDE_PATTERNS) {
            const segment = basename(path);
            if (pattern.startsWith("*")) {
              // Glob suffix match (e.g., *.log)
              const ext = pattern.slice(1);
              if (segment.endsWith(ext)) return false;
            } else if (pattern.endsWith(".*")) {
              // Prefix match (e.g., .env.*)
              const prefix = pattern.slice(0, -2);
              if (segment.startsWith(prefix)) return false;
            } else {
              if (segment === pattern) return false;
            }
          }
          return true;
        },
      },
      ["."]
    );

    const buffer = readFileSync(tarPath);
    return buffer;
  } finally {
    // Cleanup temp file
    try {
      unlinkSync(tarPath);
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Calculate SHA256 hash of a buffer.
 * @returns 64-char lowercase hex string.
 */
export function calculateHash(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

/**
 * Get the size of a buffer in a human-readable format.
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
