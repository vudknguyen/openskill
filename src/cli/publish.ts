import { Command } from "commander";
import { getValidAuth } from "../core/token-refresh.js";
import { logger, createSpinner } from "../utils/logger.js";
import { confirm } from "../utils/prompt.js";
import { validateServerUrl } from "../utils/url.js";
import {
  createMarketplaceClient,
  MarketplaceApiError,
} from "../core/marketplace-client.js";

export const publishCommand = new Command("publish")
  .description("Publish a draft skill to make it publicly available")
  .argument("<slug>", "Skill slug to publish")
  .option("-y, --yes", "Skip confirmation prompt")
  .option("-s, --server <url>", "Server URL override")
  .addHelpText(
    "after",
    `
Examples:
  $ osk publish my-skill         # Publish a draft skill
  $ osk publish my-skill -y      # Skip confirmation
`
  )
  .action(
    async (
      slug: string,
      options: {
        yes?: boolean;
        server?: string;
      }
    ) => {
      // 1. Check auth
      const auth = await getValidAuth();
      if (!auth) {
        logger.error("Not logged in. Run 'osk login' first.");
        process.exit(1);
      }

      const serverUrl = validateServerUrl(options.server || auth.serverUrl);

      // 2. Confirm
      if (!options.yes) {
        const proceed = await confirm(
          `Publish "${slug}" and make it publicly available?`,
          true
        );
        if (!proceed) {
          logger.cancelled();
          return;
        }
      }

      // 3. PATCH /api/skills/[slug] with status: "published"
      const spinner = createSpinner("Publishing...");
      try {
        const client = createMarketplaceClient(serverUrl);
        await client.updateSkillStatus(
          auth.accessToken,
          slug,
          "published",
        );

        spinner.stop("Published");
        logger.newline();
        logger.success(`${slug} is now publicly available`);
        logger.dim(`  ${serverUrl}/skills/${slug}`);
      } catch (err) {
        spinner.stop();
        if (err instanceof MarketplaceApiError) {
          logger.error(err.message);
        } else {
          logger.error(
            `Failed to publish: ${err instanceof Error ? err.message : String(err)}`
          );
        }
        process.exit(1);
      }
    }
  );
