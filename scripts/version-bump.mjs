#!/usr/bin/env node

/**
 * Bump version in package.json and package-lock.json.
 *
 * Usage:
 *   node scripts/version-bump.mjs patch              # 1.0.0 → 1.0.1
 *   node scripts/version-bump.mjs minor              # 1.0.0 → 1.1.0
 *   node scripts/version-bump.mjs major              # 1.0.0 → 2.0.0
 *   node scripts/version-bump.mjs patch --no-git     # update files only
 *
 * The `--no-git` flag skips commit and tag creation. Used by the
 * bump-and-release GHA workflow, which handles git operations itself.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const FILES = ["package.json", "package-lock.json"];

const bump = process.argv[2];
const noGit = process.argv.includes("--no-git");
if (!["patch", "minor", "major"].includes(bump)) {
  console.error("Usage: node scripts/version-bump.mjs <patch|minor|major> [--no-git]");
  process.exit(1);
}

// Read current version from package.json.
const pkgPath = join(ROOT, "package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
const [major, minor, patch] = pkg.version.split(".").map(Number);

const next =
  bump === "major"
    ? `${major + 1}.0.0`
    : bump === "minor"
      ? `${major}.${minor + 1}.0`
      : `${major}.${minor}.${patch + 1}`;

console.log(`${pkg.version} → ${next} (${bump})\n`);

// Update package.json.
pkg.version = next;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
console.log("  updated package.json");

// Update package-lock.json — both top-level "version" and the root entry
// in "packages.''" (the empty-key entry that mirrors package.json).
const lockPath = join(ROOT, "package-lock.json");
const lock = JSON.parse(readFileSync(lockPath, "utf-8"));
lock.version = next;
if (lock.packages && lock.packages[""]) {
  lock.packages[""].version = next;
}
writeFileSync(lockPath, JSON.stringify(lock, null, 2) + "\n");
console.log("  updated package-lock.json");

// Git commit + tag.
const tag = `v${next}`;

if (noGit) {
  console.log(`\nSkipped git ops (--no-git). New version: ${next}`);
} else {
  execFileSync("git", ["add", ...FILES], { cwd: ROOT, stdio: "inherit" });
  execFileSync("git", ["commit", "-m", tag], { cwd: ROOT, stdio: "inherit" });
  execFileSync("git", ["tag", tag], { cwd: ROOT, stdio: "inherit" });
  console.log(`\nTagged ${tag}. Push with:\n  git push && git push origin ${tag}`);
}
