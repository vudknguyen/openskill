import { Command } from "commander";
import { searchSkills, refreshAllRepos, loadRepoCache } from "../core/registry.js";
import { discoverSkills, type DiscoveredSkillResult } from "../core/marketplace-search.js";
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
  .option("--org <org>", "Search within an organization's skill registry")
  .addHelpText(
    "after",
    `
Examples:
  $ osk search pdf                       # Search repos + marketplace
  $ osk search pdf -i                    # Search and install
  $ osk search pdf --repo anthropic-official  # Search specific repo only
  $ osk search pdf --refresh             # Refresh repos first
  $ osk search pdf --org my-team         # Search within org registry
`
  )
  .action(async (query: string, options) => {
    if (options.refresh) {
      const spinner = createSpinner("Refreshing repositories...");
      await refreshAllRepos();
      spinner.stop("Repositories refreshed");
    }

    // Search within org registry
    if (options.org) {
      const { getValidAuth } = await import("../core/token-refresh.js");
      const { createMarketplaceClient } = await import("../core/marketplace-client.js");
      const auth = await getValidAuth();
      if (!auth) { logger.error("Not logged in. Run 'osk login' first."); process.exit(1); }

      const client = createMarketplaceClient();
      const orgs = await client.listOrgs(auth.accessToken);
      const org = orgs.find((o) => o.slug === options.org || o.id === options.org);
      if (!org) { logger.error(`Organization "${options.org}" not found.`); process.exit(1); }

      const spinner = createSpinner(`Searching ${org.name}'s registry...`);
      const result = await client.getOrgSkills(org.id, auth.accessToken);
      const lowerQuery = query.toLowerCase();
      const matches = result.skills.filter(
        (s) =>
          s.skillName.toLowerCase().includes(lowerQuery) ||
          s.skillSlug.toLowerCase().includes(lowerQuery) ||
          s.skillDescription.toLowerCase().includes(lowerQuery)
      );
      spinner.stop(`${matches.length} result(s) in ${org.name}`);

      if (matches.length === 0) {
        logger.dim("No matching skills found in org registry.");
        return;
      }

      for (const s of matches) {
        const auditBadge = s.skillAuditStatus === "pass" ? "✓" : s.skillAuditStatus === "fail" ? "✗" : "?";
        logger.log(`  ${auditBadge} ${s.skillName} (${s.skillSlug})`);
        logger.dim(`    ${s.skillDescription.slice(0, 80)}`);
      }

      logger.newline();
      logger.dim(`Install with: osk install <slug> --org ${options.org}`);
      return;
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

    // Search local repos and discovery endpoint in parallel
    logger.info(`Searching "${query}"...`);

    const [repoResults, discoveredResults] = await Promise.all([
      searchSkills(query),
      discoverSkills(query, { server: options.server }).catch(() => [] as DiscoveredSkillResult[]),
    ]);

    // Split discovered results by source
    const marketplaceResults = discoveredResults.filter((s) => s.source === "openskill");
    const githubResults = discoveredResults.filter((s) => s.source === "github");

    // Group local repo results by repo name
    const repoGroups = new Map<string, typeof repoResults>();
    for (const skill of repoResults) {
      const group = repoGroups.get(skill.repo) || [];
      group.push(skill);
      repoGroups.set(skill.repo, group);
    }

    const totalCount = repoResults.length + discoveredResults.length;

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

    let sectionsPrinted = 0;

    // openskill (marketplace) results
    if (marketplaceResults.length > 0) {
      if (sectionsPrinted > 0) logger.newline();
      logger.header(`openskill (${marketplaceResults.length})`);
      for (const skill of marketplaceResults.slice(0, 20)) {
        logger.newline();
        logger.skill(skill.name, skill.shortDescription || skill.description);
        const meta = [
          formatAuditBadge(skill.auditStatus),
          skill.authorName && `by ${skill.authorName}`,
          skill.tags && `[${skill.tags}]`,
          `osk install ${skill.slug} --marketplace`,
        ].filter(Boolean).join("  ·  ");
        logger.dim(`    ${meta}`);
      }
      sectionsPrinted++;
    }

    // github (discovered) results
    if (githubResults.length > 0) {
      if (sectionsPrinted > 0) logger.newline();
      logger.header(`github (${githubResults.length})`);
      for (const skill of githubResults.slice(0, 20)) {
        logger.newline();
        logger.skill(skill.name, skill.shortDescription || skill.description);
        const meta = [
          formatAuditBadge(skill.auditStatus),
          skill.repoFullName,
          skill.stars != null && skill.stars > 0 && `★ ${skill.stars}`,
          `osk install ${skill.repoFullName}`,
        ].filter(Boolean).join("  ·  ");
        logger.dim(`    ${meta}`);
      }
      sectionsPrinted++;
    }

    // Local repo results — one section per repo
    for (const [repoName, skills] of repoGroups) {
      if (sectionsPrinted > 0) logger.newline();
      logger.header(`${repoName} (${skills.length})`);
      for (const skill of skills.slice(0, 20)) {
        logger.newline();
        logger.skill(skill.name, skill.description);
        logger.dim(`    osk install ${skill.repoOwner}/${skill.repoName} ${skill.name}`);
      }
      if (skills.length > 20) {
        logger.newline();
        logger.dim(`  ...and ${skills.length - 20} more results`);
      }
      sectionsPrinted++;
    }

    if (options.install) {
      logger.newline();
      await interactiveInstallFromMixed(repoResults, marketplaceResults, githubResults);
    } else {
      logger.newline();
      logger.dim("Tip: Use 'osk search <query> -i' to install interactively");
    }
  });

function formatAuditBadge(status: "pass" | "warning" | "fail" | "unscanned" | null): string | null {
  switch (status) {
    case "pass": return "✔ audited";
    case "warning": return "⚠ audit warnings";
    case "fail": return "✖ audit failed";
    default: return null;
  }
}

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
