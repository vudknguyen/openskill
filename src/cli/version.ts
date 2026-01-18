import { Command } from "commander";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { logger } from "../utils/logger.js";

// This will be replaced by esbuild's define during bundling
declare const __BUILD_VERSION__: string | undefined;

/**
 * Gets the package version.
 * In bundled mode, uses the compile-time injected version.
 * In development, reads from package.json.
 * @returns The version string.
 */
export function getVersion(): string {
  // Check for build-time injected version first
  if (typeof __BUILD_VERSION__ !== "undefined") {
    return __BUILD_VERSION__;
  }

  // Fallback: read from package.json (development mode)
  try {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const packagePath = join(__dirname, "..", "..", "package.json");
    const pkg = JSON.parse(readFileSync(packagePath, "utf-8"));
    return pkg.version || "0.1.0";
  } catch {
    return "0.1.0";
  }
}

export const versionCommand = new Command("version")
  .alias("v")
  .description("Show version information")
  .option("--json", "Output as JSON")
  .action((options) => {
    const version = getVersion();
    const nodeVersion = process.version;
    const platform = process.platform;
    const arch = process.arch;

    if (options.json) {
      console.log(
        JSON.stringify(
          {
            version,
            node: nodeVersion,
            platform,
            arch,
          },
          null,
          2
        )
      );
      return;
    }

    logger.header("OpenSkill (osk)");
    logger.log(`  Version:   ${version}`);
    logger.log(`  Node.js:   ${nodeVersion}`);
    logger.log(`  Platform:  ${platform}`);
    logger.log(`  Arch:      ${arch}`);
  });
