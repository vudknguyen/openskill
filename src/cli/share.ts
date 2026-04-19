import { Command } from "commander";
import { resolve } from "path";
import { loadConfig } from "../core/config.js";
import { logger } from "../utils/logger.js";

export const shareCommand = new Command("share")
  .description("Push a skill and add it to an org registry in one step")
  .argument("[directory]", "Skill directory (default: current directory)", ".")
  .option("--org <org>", "Organization to share with (defaults to your default org)")
  .option("--visibility <visibility>", "Skill visibility: public or private", "public")
  .option("--tags <tags>", "Comma-separated tags")
  .option("--changelog <text>", "Version changelog")
  .option("-y, --yes", "Skip confirmation prompt")
  .addHelpText(
    "after",
    `
Examples:
  $ osk share                                      # Push + add to default org
  $ osk share --org my-team                        # Push + add to specific org
  $ osk share ./my-skill --org my-team -y          # Skip confirmation
  $ osk share --org my-team --visibility private   # Private org skill
`
  )
  .action(async (directory: string, options: {
    org?: string;
    visibility?: string;
    tags?: string;
    changelog?: string;
    yes?: boolean;
  }) => {
    const orgSlug = options.org || loadConfig().defaultOrg;
    if (!orgSlug) {
      logger.error("No org specified. Use --org <org> or set a default with: osk org set-default <org>");
      process.exitCode = 1;
      return;
    }

    // Step 1: Push the skill with --org
    logger.info(`Sharing skill to org "${orgSlug}"...`);
    logger.newline();

    try {
      const { pushCommand } = await import("./push.js");
      await pushCommand.parseAsync([
        "node", "osk", "push",
        resolve(directory),
        "--org", orgSlug,
        "--visibility", options.visibility || "public",
        ...(options.tags ? ["--tags", options.tags] : []),
        ...(options.changelog ? ["--changelog", options.changelog] : []),
        ...(options.yes ? ["-y"] : []),
      ]);
    } catch (err) {
      logger.error(`Push failed: ${err instanceof Error ? err.message : String(err)}`);
      process.exitCode = 1;
      return;
    }

    logger.newline();
    logger.success(`Skill shared with org "${orgSlug}"`);
  });
