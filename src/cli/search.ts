import { Command } from "commander";
import { searchSkills, refreshAllRepos, loadRepoCache } from "../core/registry.js";
import { loadConfig } from "../core/config.js";
import { logger, createSpinner } from "../utils/logger.js";
import { interactiveInstallFromSkills } from "./install.js";

export const searchCommand = new Command("search")
  .alias("s")
  .description("Search for skills in repositories")
  .argument("<query>", "Search query")
  .option("-r, --repo <name>", "Search in specific repository")
  .option("-i, --install", "Search and install interactively")
  .option("--refresh", "Refresh repositories before searching")
  .addHelpText(
    "after",
    `
Examples:
  $ osk search pdf                       # Search all repos
  $ osk search pdf -i                    # Search and install
  $ osk search pdf --repo anthropic-official  # Search specific repo
  $ osk search pdf --refresh             # Refresh repos first
`
  )
  .action(async (query: string, options) => {
    if (options.refresh) {
      const spinner = createSpinner("Refreshing repositories...");
      await refreshAllRepos();
      spinner.stop("Repositories refreshed");
    }

    let results;

    if (options.repo) {
      // Search in specific repo
      const config = loadConfig();
      const repo = config.repos.find((r) => r.name === options.repo);

      if (!repo) {
        logger.error(`Repository not found: ${options.repo}`);
        logger.dim(`Available repositories: ${config.repos.map((r) => r.name).join(", ")}`);
        process.exit(1);
      }

      const skills = loadRepoCache(options.repo);
      const lowerQuery = query.toLowerCase();

      results = skills.filter(
        (skill) =>
          skill.name.toLowerCase().includes(lowerQuery) ||
          skill.description.toLowerCase().includes(lowerQuery)
      );

      logger.info(`Searching "${query}" in ${options.repo}...`);
    } else {
      logger.info(`Searching "${query}" in all repositories...`);
      results = await searchSkills(query);
    }

    if (results.length === 0) {
      logger.warn("No skills found");
      const config = loadConfig();
      if (config.repos.length === 0) {
        logger.dim("No repositories configured. Add one with: osk repo add owner/repo");
      } else {
        logger.dim("Try syncing repositories with: osk repo sync");
        logger.dim("Or try a different search term");
      }
      return;
    }

    const maxDisplay = 20;
    const displayResults = results.slice(0, maxDisplay);
    const hasMore = results.length > maxDisplay;

    logger.header(`Found ${results.length} skill(s)`);

    for (const skill of displayResults) {
      logger.newline();
      logger.skill(skill.name, skill.description);
      logger.dim(`  Repository: ${skill.repo}`);
    }

    if (hasMore) {
      logger.newline();
      logger.dim(`  ...and ${results.length - maxDisplay} more results`);
    }

    // Interactive install mode
    if (options.install) {
      logger.newline();
      await interactiveInstallFromSkills(results);
    } else {
      logger.newline();
      logger.dim("Tip: Use 'osk search <query> -i' to install interactively");
    }
  });
