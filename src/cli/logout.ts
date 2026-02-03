import { Command } from "commander";
import { logger } from "../utils/logger.js";
import { loadAuth, clearAuth } from "../core/auth.js";

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
      try {
        await fetch(`${auth.serverUrl}/api/auth/revoke`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: auth.refreshToken }),
        });
      } catch {
        // Ignore — clearing local auth is sufficient
      }
    }

    clearAuth();
    logger.success(`Logged out (was ${name})`);
  });
