import { Command } from "commander";
import { loadConfig, addRepo, removeRepo } from "../core/config.js";
import { refreshRepo, getRepoInfo, loadRepoCache } from "../core/registry.js";
import { parseGitUrl } from "../utils/fs.js";
import { logger, createSpinner } from "../utils/logger.js";

export const repoCommand = new Command("repo")
  .description("Manage skill repositories")
  .addHelpText(
    "after",
    `
Examples:
  $ osk repo add anthropics/skills              # Add GitHub repository
  $ osk repo add https://gitlab.com/user/repo   # Add GitLab repository
  $ osk repo add git@github.com:user/repo.git   # Add via SSH
  $ osk repo ls                                 # List repositories
  $ osk repo sync                               # Sync all repositories
  $ osk repo rm anthropic-official              # Remove a repository
`
  )
  .action(() => {
    // Show help when no subcommand is provided
    repoCommand.help();
  });

// Subcommand: add
repoCommand
  .command("add <source>")
  .description("Add a skill repository")
  .option("-n, --name <name>", "Custom name for the repository")
  .addHelpText(
    "after",
    `
Examples:
  $ osk repo add anthropics/skills                   # GitHub shorthand
  $ osk repo add https://github.com/user/repo        # HTTPS URL
  $ osk repo add https://gitlab.com/user/repo        # GitLab
  $ osk repo add git@github.com:user/repo.git        # SSH URL
  $ osk repo add https://self-hosted.com/user/repo --name my-skills
`
  )
  .action(async (source: string, options) => {
    // Parse the source - parseGitUrl handles all formats
    const parsed = parseGitUrl(source);
    if (!parsed) {
      logger.error(`Invalid repository format: ${source}`);
      logger.dim("Supported formats:");
      logger.dim("  owner/repo (GitHub shorthand)");
      logger.dim("  https://host/owner/repo");
      logger.dim("  git@host:owner/repo.git");
      process.exit(1);
    }

    const url = parsed.cloneUrl;
    let name = options.name;

    // Generate name if not provided
    if (!name) {
      name = `${parsed.owner}-${parsed.repo}`;
    }

    // Check if already exists
    const config = loadConfig();
    const existing = config.repos.find((r) => r.name === name);
    if (existing) {
      logger.warn(`Repository already exists: ${name}`);
      logger.dim(`URL: ${existing.url}`);
      return;
    }

    // Add to config
    addRepo(name, url);
    logger.success(`Added repository: ${name}`);

    // Sync immediately
    const spinner = createSpinner(`Syncing ${name}...`);
    try {
      const skills = await refreshRepo(name, url);
      spinner.stop(`Synced ${name} (${skills.length} skills)`);
    } catch (err) {
      spinner.stop();
      logger.warn(`Added but failed to sync: ${err instanceof Error ? err.message : String(err)}`);
      logger.dim("Run 'osk repo sync' to try again");
    }
  });

// Subcommand: ls (list)
repoCommand
  .command("ls")
  .alias("list")
  .description("List skill repositories")
  .action(() => {
    const config = loadConfig();

    if (config.repos.length === 0) {
      logger.info("No repositories configured");
      logger.dim("Add one with: osk repo add owner/repo");
      return;
    }

    logger.header("Skill Repositories");

    for (const repo of config.repos) {
      const info = getRepoInfo(repo.name, repo.url);
      const skillCount = info.skillCount > 0 ? `${info.skillCount} skills` : "not synced";
      const lastSync = info.lastUpdated ? new Date(info.lastUpdated).toLocaleDateString() : "never";

      logger.log(`  ${repo.name}`);
      logger.dim(`    URL: ${repo.url}`);
      logger.dim(`    Skills: ${skillCount} • Last sync: ${lastSync}`);
      logger.newline();
    }
  });

// Subcommand: rm (remove)
repoCommand
  .command("rm <name>")
  .alias("remove")
  .description("Remove a skill repository")
  .action((name: string) => {
    const removed = removeRepo(name);
    if (removed) {
      logger.success(`Removed repository: ${name}`);
    } else {
      logger.error(`Repository not found: ${name}`);

      const config = loadConfig();
      if (config.repos.length > 0) {
        logger.dim(`Available repositories: ${config.repos.map((r) => r.name).join(", ")}`);
      }
      process.exit(1);
    }
  });

// Subcommand: sync
repoCommand
  .command("sync [name]")
  .description("Sync repositories to fetch latest skills")
  .addHelpText(
    "after",
    `
Examples:
  $ osk repo sync                        # Sync all repositories
  $ osk repo sync anthropic-official      # Sync specific repository
`
  )
  .action(async (name?: string) => {
    const config = loadConfig();

    if (config.repos.length === 0) {
      logger.info("No repositories configured");
      logger.dim("Add one with: osk repo add owner/repo");
      return;
    }

    if (name) {
      // Sync specific repo
      const repo = config.repos.find((r) => r.name === name);
      if (!repo) {
        logger.error(`Repository not found: ${name}`);
        logger.dim(`Available repositories: ${config.repos.map((r) => r.name).join(", ")}`);
        process.exit(1);
      }

      const spinner = createSpinner(`Syncing ${name}...`);
      try {
        const skills = await refreshRepo(repo.name, repo.url);
        spinner.stop(`Synced ${name} (${skills.length} skills)`);
      } catch (err) {
        spinner.stop();
        logger.error(`Failed to sync ${name}: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    } else {
      // Sync all repos with progress
      let totalSkills = 0;
      let failed = 0;
      const repoCount = config.repos.length;

      for (let i = 0; i < repoCount; i++) {
        const repo = config.repos[i];
        const progress = repoCount > 1 ? `[${i + 1}/${repoCount}] ` : "";
        const spinner = createSpinner(`${progress}Syncing ${repo.name}...`);
        try {
          const skills = await refreshRepo(repo.name, repo.url);
          totalSkills += skills.length;
          spinner.stop(`${progress}Synced ${repo.name} (${skills.length} skills)`);
        } catch (err) {
          spinner.stop();
          logger.warn(
            `${progress}Failed to sync ${repo.name}: ${err instanceof Error ? err.message : String(err)}`
          );
          failed++;
        }
      }

      logger.newline();
      if (failed === 0) {
        logger.success(`Synced ${repoCount} repositories (${totalSkills} total skills)`);
      } else {
        logger.warn(`Synced with ${failed} failure(s)`);
      }
    }
  });

// Subcommand: info
repoCommand
  .command("info <name>")
  .description("Show detailed info about a repository")
  .action((name: string) => {
    const config = loadConfig();
    const repo = config.repos.find((r) => r.name === name);

    if (!repo) {
      logger.error(`Repository not found: ${name}`);
      process.exit(1);
    }

    const info = getRepoInfo(repo.name, repo.url);
    const skills = loadRepoCache(name);

    logger.header(name);
    logger.log(`  URL:        ${repo.url}`);
    logger.log(`  Skills:     ${info.skillCount}`);
    logger.log(
      `  Last sync:  ${info.lastUpdated ? new Date(info.lastUpdated).toLocaleString() : "never"}`
    );

    if (skills.length > 0) {
      logger.newline();
      logger.log("  Available skills:");
      for (const skill of skills.slice(0, 10)) {
        logger.dim(`    • ${skill.name}`);
      }
      if (skills.length > 10) {
        logger.dim(`    ... and ${skills.length - 10} more`);
      }
    }
  });
