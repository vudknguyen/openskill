import { Command } from "commander";
import { logger } from "../utils/logger.js";
import { loadAuth, clearAuth } from "../core/auth.js";
import { MarketplaceClient } from "../core/marketplace-client.js";
import { validateServerUrl } from "../utils/url.js";

export const logoutCommand = new Command("logout")
  .description("Log out from the OpenSkill marketplace")
  .addHelpText(
    "after",
    `
Examples:
  $ osk logout`
  )
  .action(async () => {
    const auth = loadAuth();
    if (!auth) {
      logger.info("Not currently logged in.");
      return;
    }

    const name = auth.user?.name ?? auth.user?.email ?? "unknown";

    // Best-effort server-side revocation of refresh token
    if (auth.refreshToken) {
      const client = new MarketplaceClient(validateServerUrl(auth.serverUrl));
      await client.revokeToken(auth.refreshToken);
    }

    clearAuth();
    logger.success(`Logged out (was ${name})`);
  });
