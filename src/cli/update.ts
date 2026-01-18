import { Command } from "commander";
import { join } from "path";
import { getAgent } from "../agents/index.js";
import { getSkillsCacheDir } from "../core/config.js";
import { updateRepo, getRepoCommit, getCommitMessages } from "../core/git.js";
import { getAllInstalledSkills, addSkillRecord, InstalledSkillRecord } from "../core/manifest.js";
import { refreshAllRepos } from "../core/registry.js";
import { loadSkillFromDir } from "../core/skill.js";
import { safeJoinPath } from "../utils/fs.js";
import { logger, createSpinner } from "../utils/logger.js";
import { autocomplete } from "../utils/prompt.js";

interface SkillUpdate {
  record: InstalledSkillRecord;
  currentCommit: string;
  latestCommit: string;
}

export const updateCommand = new Command("update")
  .alias("up")
  .description("Update skills and repositories")
  .option("--repos", "Only update repository caches")
  .option("--check", "Only check for updates, don't install")
  .addHelpText(
    "after",
    `
Examples:
  $ osk up                     # Interactive update
  $ osk up --check             # Check for updates only
  $ osk up --repos             # Update repository cache
`
  )
  .action(async (options) => {
    if (options.repos) {
      const spinner = createSpinner("Updating repositories...");
      await refreshAllRepos();
      spinner.stop("Repositories updated");
      return;
    }

    // Get all installed skills
    const installed = getAllInstalledSkills();

    if (installed.length === 0) {
      logger.info("No skills installed");
      return;
    }

    // Group skills by repo to avoid redundant fetches
    const repoMap = new Map<string, InstalledSkillRecord[]>();
    for (const skill of installed) {
      const key = `${skill.repoOwner}/${skill.repoName}`;
      if (!repoMap.has(key)) {
        repoMap.set(key, []);
      }
      repoMap.get(key)!.push(skill);
    }

    const repoCount = repoMap.size;
    let checkedCount = 0;

    const spinner = createSpinner(`Checking for updates (0/${repoCount} repositories)...`);

    // Check each repo for updates
    const updates: SkillUpdate[] = [];

    for (const [repoKey, skills] of repoMap) {
      checkedCount++;
      spinner.update(`Checking for updates (${checkedCount}/${repoCount}): ${repoKey}...`);

      const [owner, repo] = repoKey.split("/");
      if (!owner || !repo) {
        logger.warn(`Invalid repository key: ${repoKey}`);
        continue;
      }

      // Fetch latest from remote
      const result = await updateRepo(owner, repo);
      if (!result.success) {
        logger.warn(`Failed to check ${repoKey}: ${result.error}`);
        continue;
      }

      const latestCommit = await getRepoCommit(owner, repo);
      if (!latestCommit) continue;

      // Check each skill from this repo
      for (const skill of skills) {
        if (skill.commitHash !== latestCommit) {
          updates.push({
            record: skill,
            currentCommit: skill.commitHash,
            latestCommit,
          });
        }
      }
    }

    if (updates.length === 0) {
      spinner.stop(`All ${installed.length} skill(s) are up to date`);
      return;
    }

    spinner.stop(`Found ${updates.length} update(s)`);

    // Show available updates with commit summaries
    logger.header(`${updates.length} update(s) available`);

    for (const update of updates) {
      const { record, currentCommit, latestCommit } = update;
      logger.log(
        `  ${record.name} (${record.agent}): ${currentCommit.slice(0, 7)} → ${latestCommit.slice(0, 7)}`
      );

      // Show recent commit messages
      const commits = getCommitMessages(
        record.repoOwner,
        record.repoName,
        currentCommit,
        latestCommit,
        3
      );
      if (commits.length > 0) {
        for (const commit of commits) {
          logger.dim(`    ${commit}`);
        }
      }
    }
    logger.newline();

    if (options.check) {
      return;
    }

    // Let user select which to update
    const selected = await autocomplete(
      "Search and select skills to update (space to select, enter to confirm):",
      updates.map((u) => ({
        name: u.record.name,
        hint: `${u.record.agent} • ${u.currentCommit.slice(0, 7)} → ${u.latestCommit.slice(0, 7)}`,
        value: u,
      })),
      { multiple: true }
    );

    if (selected.length === 0) {
      logger.warn("No skills selected. Update cancelled.");
      logger.dim("Run 'osk update' again to retry selection");
      return;
    }

    // Perform updates
    logger.newline();
    for (const update of selected) {
      const { record, latestCommit } = update;
      const agent = getAgent(record.agent);
      if (!agent) continue;

      // Find skill in cached repo
      const repoPath = join(getSkillsCacheDir(), `${record.repoOwner}-${record.repoName}`);
      let skillPath: string | null = null;
      if (record.repoPath) {
        skillPath = safeJoinPath(repoPath, record.repoPath);
      } else {
        const skillsDir = safeJoinPath(repoPath, "skills");
        if (skillsDir) {
          skillPath = safeJoinPath(skillsDir, record.name);
        }
      }

      if (!skillPath) {
        logger.warn(`Invalid path for ${record.name}`);
        continue;
      }

      const skill = loadSkillFromDir(skillPath);
      if (!skill) {
        logger.warn(`Could not load ${record.name}`);
        continue;
      }

      await agent.installSkill(skill, skillPath, undefined, record.scope);

      // Update manifest
      addSkillRecord({
        ...record,
        commitHash: latestCommit,
        installedAt: new Date().toISOString(),
      });

      logger.success(`Updated ${record.name} → ${record.agent}`);
    }
  });
