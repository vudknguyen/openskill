import { Command } from "commander";
import { logger } from "../utils/logger.js";
import { getValidAuth } from "../core/token-refresh.js";

export const whoamiCommand = new Command("whoami")
  .description("Show current login status and profile")
  .addHelpText(
    "after",
    `
Examples:
  $ osk whoami`
  )
  .action(async () => {
    const auth = await getValidAuth();

    if (!auth) {
      logger.info("Not logged in. Run 'osk login' to authenticate.");
      return;
    }

    logger.header("OpenSkill Profile");

    if (auth.user) {
      logger.log(`  Name:    ${auth.user.name}`);
      logger.log(`  Email:   ${auth.user.email}`);
      logger.log(`  ID:      ${auth.user.id}`);
    }

    logger.log(`  Server:  ${auth.serverUrl}`);

    if (auth.refreshExpiresAt) {
      const expires = new Date(auth.refreshExpiresAt);
      const days = Math.ceil((expires.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      logger.log(`  Session: expires ${expires.toLocaleDateString()} (${days}d)`);
    }

    logger.dim(`  Since:   ${new Date(auth.createdAt).toLocaleDateString()}`);
  });
