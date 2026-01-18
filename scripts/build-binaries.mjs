#!/usr/bin/env node
/**
 * Build standalone binaries for OpenSkill CLI.
 *
 * This script:
 * 1. Bundles all code into a single file with esbuild
 * 2. Uses pkg to compile into standalone executables
 *
 * Usage: node scripts/build-binaries.mjs
 */

import { build } from "esbuild";
import { exec } from "child_process";
import { promisify } from "util";
import { existsSync, mkdirSync, rmSync, readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const execAsync = promisify(exec);

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");
const distDir = join(rootDir, "dist-bin");
const bundleFile = join(distDir, "osk-bundle.cjs");

// Read version from package.json
const pkg = JSON.parse(readFileSync(join(rootDir, "package.json"), "utf-8"));
const version = pkg.version;

// Target platforms for pkg
const platforms = [
  "node18-linux-x64",
  "node18-linux-arm64",
  "node18-macos-x64",
  "node18-macos-arm64",
  "node18-win-x64",
];

async function main() {
  console.log("🔨 Building OpenSkill standalone binaries...\n");

  // Clean and create dist-bin directory
  if (existsSync(distDir)) {
    rmSync(distDir, { recursive: true });
  }
  mkdirSync(distDir, { recursive: true });

  // Step 1: Bundle with esbuild
  console.log("📦 Bundling with esbuild...");
  try {
    await build({
      entryPoints: [join(rootDir, "dist/cli/index.js")],
      bundle: true,
      platform: "node",
      target: "node18",
      format: "cjs",
      outfile: bundleFile,
      external: [],
      minify: true,
      sourcemap: false,
      define: {
        __BUILD_VERSION__: JSON.stringify(version),
      },
    });
    console.log("✅ Bundle created: dist-bin/osk-bundle.cjs\n");
  } catch (err) {
    console.error("❌ Bundling failed:", err.message);
    process.exit(1);
  }

  // Step 2: Build binaries with pkg
  console.log("🔧 Building binaries with pkg...");

  for (const platform of platforms) {
    const [, os, arch] = platform.match(/node\d+-(\w+)-(\w+)/);
    const ext = os === "win" ? ".exe" : "";
    const outputName = `osk-${os}-${arch}${ext}`;
    const outputPath = join(distDir, outputName);

    console.log(`  Building ${outputName}...`);

    try {
      await execAsync(
        `npx @yao-pkg/pkg "${bundleFile}" --target ${platform} --output "${outputPath}"`,
        { cwd: rootDir }
      );
      console.log(`  ✅ ${outputName}`);
    } catch (err) {
      console.error(`  ❌ Failed to build ${outputName}:`, err.message);
    }
  }

  console.log("\n🎉 Build complete! Binaries are in dist-bin/");
  console.log("\nBuilt files:");

  const { readdirSync, statSync } = await import("fs");
  const files = readdirSync(distDir).filter((f) => f.startsWith("osk-"));
  for (const file of files) {
    const size = (statSync(join(distDir, file)).size / 1024 / 1024).toFixed(1);
    console.log(`  - ${file} (${size} MB)`);
  }
}

main().catch(console.error);
