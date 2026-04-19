import { Command } from "commander";
import { resolve, join } from "path";
import { existsSync, readFileSync } from "fs";
import { getValidAuth } from "../core/token-refresh.js";
import { loadConfig } from "../core/config.js";
import { validateServerUrl } from "../utils/url.js";
import { logger, createSpinner } from "../utils/logger.js";
import { displayFindings } from "../utils/audit-display.js";
import { createMarketplaceClient, MarketplaceApiError } from "../core/marketplace-client.js";

const statusColors: Record<string, string> = {
  pass: "\x1b[32m", // green
  warning: "\x1b[33m", // yellow
  fail: "\x1b[31m", // red
};

export const auditCommand = new Command("audit")
  .description("Run a security audit on a local skill")
  .argument("[directory]", "Skill directory (default: current directory)", ".")
  .option("-s, --server <url>", "Server URL override")
  .addHelpText(
    "after",
    `
Examples:
  $ osk audit                  # Audit current directory
  $ osk audit ./my-skill       # Audit specific directory
`
  )
  .action(async (directory: string, options: { server?: string }) => {
    // 1. Resolve directory and read SKILL.md
    const skillDir = resolve(directory);
    const skillMdPath = join(skillDir, "SKILL.md");

    if (!existsSync(skillMdPath)) {
      logger.error(`No SKILL.md found in ${skillDir}`);
      logger.dim("Specify a directory containing a SKILL.md file.");
      process.exit(1);
    }

    const content = readFileSync(skillMdPath, "utf-8");

    // 2. Determine server URL: CLI flag → auth → config
    let serverUrl: string;
    if (options.server) {
      serverUrl = validateServerUrl(options.server);
    } else {
      const auth = await getValidAuth().catch(() => null);
      const raw = auth?.serverUrl || loadConfig().serverUrl;
      serverUrl = validateServerUrl(raw);
    }

    const client = createMarketplaceClient(serverUrl);

    // 3. Run audit
    const spinner = createSpinner("Running security audit...");
    try {
      const result = await client.auditSkill(content);
      spinner.stop("Audit complete");

      // 4. Display results
      logger.newline();
      const color = statusColors[result.status] || "";
      logger.log(`  Skill:   ${result.skill.name}`);
      logger.log(`  Status:  ${color}${result.status.toUpperCase()}\x1b[0m`);
      logger.log(`  Score:   ${result.score}/100`);

      if (result.findings.length > 0) {
        logger.newline();
        displayFindings(result.findings);
      }

      logger.newline();

      // 5. Exit code 1 on failure
      if (result.status === "fail") {
        process.exit(1);
      }
    } catch (err) {
      spinner.stop();
      if (err instanceof MarketplaceApiError) {
        logger.error(err.message);
      } else {
        logger.error(`Audit failed: ${err instanceof Error ? err.message : String(err)}`);
      }
      process.exit(1);
    }
  });
