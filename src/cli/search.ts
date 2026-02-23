import { Command } from "commander";
import { searchSkills, refreshAllRepos, loadRepoCache } from "../core/registry.js";
import { searchMarketplace, type MarketplaceSkillResult } from "../core/marketplace-search.js";
import { loadConfig } from "../core/config.js";
import { logger, createSpinner } from "../utils/logger.js";
import { interactiveInstallFromSkills, interactiveInstallFromMixed } from "./install.js";

export const searchCommand = new Command("search")
  .alias("s")
  .description("Search for skills in repositories and marketplace")
  .argument("<query>", "Search query")
  .option("-r, --repo <name>", "Search in specific repository")
  .option("-i, --install", "Search and install interactively")
  .option("--refresh", "Refresh repositories before searching")
  .option("-s, --server <url>", "Server URL override")
  .addHelpText(
    "after",
    `
Examples:
  $ osk search pdf                       # Search repos + marketplace
  $ osk search pdf -i                    # Search and install
  $ osk search pdf --repo anthropic-official  # Search specific repo only
  $ osk search pdf --refresh             # Refresh repos first
`
  )
  .action(async (query: string, options) => {
    if (options.refresh) {
      const spinner = createSpinner("Refreshing repositories...");
      await refreshAllRepos();
      spinner.stop("Repositories refreshed");
    }

    // Searching a specific repo skips marketplace
    if (options.repo) {
      const config = loadConfig();
      const repo = config.repos.find((r) => r.name === options.repo);

      if (!repo) {
        logger.error(`Repository not found: ${options.repo}`);
        logger.dim(`Available repositories: ${config.repos.map((r) => r.name).join(", ")}`);
        process.exit(1);
      }

      const skills = loadRepoCache(options.repo);
      const lowerQuery = query.toLowerCase();

      const results = skills.filter(
        (skill) =>
          skill.name.toLowerCase().includes(lowerQuery) ||
          skill.description.toLowerCase().includes(lowerQuery)
      );

      logger.info(`Searching "${query}" in ${options.repo}...`);
      displayRepoResults(results);

      if (options.install && results.length > 0) {
        logger.newline();
        await interactiveInstallFromSkills(results);
      }
      return;
    }

    // Search both local repos and marketplace in parallel
    logger.info(`Searching "${query}"...`);

    const [repoResults, marketplaceResults] = await Promise.all([
      searchSkills(query),
      searchMarketplace(query, { server: options.server }).catch(() => [] as MarketplaceSkillResult[]),
    ]);

    const totalCount = repoResults.length + marketplaceResults.length;

    if (totalCount === 0) {
      logger.warn("No skills found");
      const config = loadConfig();
      if (config.repos.length === 0) {
        logger.dim("No repositories configured. Add one with: osk repo add owner/repo");
      } else {
        logger.dim("Try a different search term");
      }
      return;
    }

    // Marketplace results
    if (marketplaceResults.length > 0) {
      logger.header(`Marketplace (${marketplaceResults.length})`);
      for (const skill of marketplaceResults.slice(0, 20)) {
        logger.newline();
        logger.skill(skill.name, skill.shortDescription || skill.description);
        const meta = [
          skill.authorName && `by ${skill.authorName}`,
          skill.tags && `[${skill.tags}]`,
          `osk install ${skill.slug} --marketplace`,
        ].filter(Boolean).join("  ·  ");
        logger.dim(`    ${meta}`);
      }
    }

    // Repo results
    if (repoResults.length > 0) {
      if (marketplaceResults.length > 0) logger.newline();
      logger.header(`Repositories (${repoResults.length})`);
      displayRepoResults(repoResults);
    }

    if (options.install) {
      logger.newline();
      await interactiveInstallFromMixed(repoResults, marketplaceResults);
    } else {
      logger.newline();
      logger.dim("Tip: Use 'osk search <query> -i' to install interactively");
    }
  });

function displayRepoResults(results: Array<{ name: string; description: string; repo: string }>) {
  const maxDisplay = 20;
  const displayResults = results.slice(0, maxDisplay);

  for (const skill of displayResults) {
    logger.newline();
    logger.skill(skill.name, skill.description);
    logger.dim(`    Repository: ${skill.repo}`);
  }

  if (results.length > maxDisplay) {
    logger.newline();
    logger.dim(`  ...and ${results.length - maxDisplay} more results`);
  }
}
