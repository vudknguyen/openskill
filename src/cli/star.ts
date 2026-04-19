import { Command } from "commander";
import { getValidAuth } from "../core/token-refresh.js";
import { logger, createSpinner } from "../utils/logger.js";
import { validateServerUrl } from "../utils/url.js";

export const starCommand = new Command("star")
  .description("Star or list starred skills on the marketplace")
  .argument("[slug]", "Skill slug to star (omit to list starred skills)")
  .option("--unstar", "Remove star from a skill")
  .addHelpText(
    "after",
    `
Examples:
  $ osk star my-skill            # Star a skill
  $ osk star                     # List your starred skills
  $ osk star my-skill --unstar   # Remove star
`
  )
  .action(async (slug: string | undefined, options: { unstar?: boolean }) => {
    const auth = await getValidAuth();
    if (!auth) {
      logger.error("Not logged in. Run 'osk login' first.");
      process.exitCode = 1;
      return;
    }

    const serverUrl = validateServerUrl(auth.serverUrl);

    if (!slug) {
      // List starred skills
      const spinner = createSpinner("Loading starred skills...");
      try {
        const res = await fetch(`${serverUrl}/api/user/stars`, {
          headers: { Authorization: `Bearer ${auth.accessToken}` },
        });
        if (!res.ok) {
          spinner.stop();
          logger.error(`Failed to load stars (${res.status})`);
          process.exitCode = 1;
          return;
        }
        const data = (await res.json()) as {
          skills: Array<{ slug: string; name: string; description: string }>;
        };
        spinner.stop(`${data.skills.length} starred skill(s)`);

        if (data.skills.length === 0) {
          logger.dim("No starred skills yet. Star one with: osk star <skill-slug>");
          return;
        }

        for (const skill of data.skills) {
          logger.log(`  ★ ${skill.name} (${skill.slug})`);
          logger.dim(`    ${skill.description.slice(0, 80)}`);
        }
      } catch (err) {
        spinner.stop();
        logger.error(`Failed to load stars: ${err instanceof Error ? err.message : String(err)}`);
        process.exitCode = 1;
      }
      return;
    }

    // Star or unstar a skill
    const action = options.unstar ? "unstar" : "star";
    const spinner = createSpinner(
      `${options.unstar ? "Removing star from" : "Starring"} ${slug}...`
    );
    try {
      const method = options.unstar ? "DELETE" : "POST";
      const res = await fetch(`${serverUrl}/api/skills/${encodeURIComponent(slug)}/star`, {
        method,
        headers: { Authorization: `Bearer ${auth.accessToken}` },
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        spinner.stop();
        logger.error((body as { error?: string }).error || `Failed to ${action} (${res.status})`);
        process.exitCode = 1;
        return;
      }

      spinner.stop(options.unstar ? "Star removed" : "Starred");
      logger.success(`${options.unstar ? "Unstarred" : "Starred"} ${slug}`);
    } catch (err) {
      spinner.stop();
      logger.error(`Failed to ${action}: ${err instanceof Error ? err.message : String(err)}`);
      process.exitCode = 1;
    }
  });
