import { Command } from "commander";
import { loadConfig } from "../core/config.js";
import { getAllRepoSkills, loadRepoCache, getRepoInfo, RepoSkill } from "../core/registry.js";
import { logger } from "../utils/logger.js";
import { truncate } from "../utils/fs.js";
import { interactiveInstallFromSkills } from "./install.js";

export const browseCommand = new Command("browse")
  .alias("b")
  .description("Browse available skills from repositories")
  .argument("[repo]", "Repository name to browse")
  .option("-i, --install", "Search and install a skill interactively")
  .addHelpText(
    "after",
    `
Examples:
  $ osk browse                           # Browse all repos
  $ osk browse anthropic-official         # Browse specific repo
  $ osk browse -i                        # Browse and install
`
  )
  .action(async (repoName?: string, options?: { install?: boolean }) => {
    const config = loadConfig();

    if (config.repos.length === 0) {
      logger.info("No repositories configured");
      logger.dim("Add one with: osk repo add owner/repo");
      return;
    }

    let skills: RepoSkill[];

    if (repoName) {
      // Browse specific repo
      const repo = config.repos.find((r) => r.name === repoName);
      if (!repo) {
        logger.error(`Repository not found: ${repoName}`);
        logger.dim(`Available repositories: ${config.repos.map((r) => r.name).join(", ")}`);
        process.exit(1);
      }

      skills = loadRepoCache(repoName);

      if (skills.length === 0) {
        logger.info(`No skills found in ${repoName}`);
        logger.dim("Try syncing with: osk repo sync " + repoName);
        return;
      }

      logger.header(`${repoName} (${skills.length} skills)`);
    } else {
      // Browse all repos
      skills = getAllRepoSkills();

      if (skills.length === 0) {
        logger.info("No skills found");
        logger.dim("Try syncing repositories with: osk repo sync");
        return;
      }

      // Show summary by repo
      logger.header("Available Skills");

      for (const repo of config.repos) {
        const info = getRepoInfo(repo.name, repo.url);
        if (info.skillCount > 0) {
          logger.log(`  ${repo.name} (${info.skillCount} skills)`);
        }
      }
      logger.newline();
    }

    // Group skills by repo for display
    const byRepo = new Map<string, RepoSkill[]>();
    for (const skill of skills) {
      const key = skill.repo;
      if (!byRepo.has(key)) {
        byRepo.set(key, []);
      }
      byRepo.get(key)!.push(skill);
    }

    // Display skills grouped by repo
    for (const [repo, repoSkills] of byRepo) {
      if (!repoName) {
        logger.log(`  ${repo}:`);
      }

      for (const skill of repoSkills) {
        const prefix = repoName ? "  " : "    ";
        logger.log(`${prefix}• ${skill.name}`);
        if (skill.description) {
          logger.dim(`${prefix}  ${truncate(skill.description, 60)}`);
        }
      }
      logger.newline();
    }

    // Interactive install mode
    if (options?.install) {
      await interactiveInstallFromSkills(skills);
    } else {
      logger.dim("Tip: Use 'osk browse -i' to interactively select and install");
    }
  });
