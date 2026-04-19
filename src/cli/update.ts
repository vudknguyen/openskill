import { Command } from "commander";
import { join } from "path";
import { getAgent } from "../agents/index.js";
import { getSkillsCacheDir } from "../core/config.js";
import { updateRepo, getRepoCommit, getCommitMessages } from "../core/git.js";
import { getAllInstalledSkills, addSkillRecord, InstalledSkillRecord } from "../core/manifest.js";
import { refreshAllRepos } from "../core/registry.js";
import { loadSkillFromDir } from "../core/skill.js";
import { installFromMarketplace } from "../core/marketplace-installer.js";
import {
  checkMarketplaceUpdates,
  type MarketplaceUpdate,
} from "../core/marketplace-update-checker.js";
import { safeJoinPath } from "../utils/fs.js";
import { logger, createSpinner } from "../utils/logger.js";
import { autocomplete } from "../utils/prompt.js";
import { trackUpdate } from "../core/telemetry.js";

interface GitSkillUpdate {
  source: "git";
  record: InstalledSkillRecord;
  currentCommit: string;
  latestCommit: string;
}

interface MarketplaceSkillUpdate {
  source: "marketplace";
  record: InstalledSkillRecord;
  update: MarketplaceUpdate;
}

type SkillUpdate = GitSkillUpdate | MarketplaceSkillUpdate;

export const updateCommand = new Command("update")
  .alias("up")
  .description("Update skills and repositories")
  .option("--repos", "Only update repository caches")
  .option("--check", "Only check for updates, don't install")
  .option("-s, --server <url>", "Server URL override")
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

    const installed = getAllInstalledSkills();

    if (installed.length === 0) {
      logger.info("No skills installed");
      return;
    }

    // Split by source
    const gitSkills: InstalledSkillRecord[] = [];
    const marketplaceSkills: InstalledSkillRecord[] = [];

    for (const skill of installed) {
      if (skill.source === "marketplace") {
        marketplaceSkills.push(skill);
      } else {
        gitSkills.push(skill);
      }
    }

    const updates: SkillUpdate[] = [];

    // Check git-based skills
    if (gitSkills.length > 0) {
      const gitUpdates = await checkGitUpdates(gitSkills);
      updates.push(...gitUpdates);
    }

    // Check marketplace-based skills
    if (marketplaceSkills.length > 0) {
      const mpUpdates = await checkMarketplaceSkillUpdates(marketplaceSkills, options.server);
      updates.push(...mpUpdates);
    }

    if (updates.length === 0) {
      logger.info(`All ${installed.length} skill(s) are up to date`);
      return;
    }

    // Display available updates
    logger.header(`${updates.length} update(s) available`);

    for (const update of updates) {
      if (update.source === "git") {
        const { record, currentCommit, latestCommit } = update;
        logger.log(
          `  ${record.name} (${record.agent}): ${currentCommit.slice(0, 7)} → ${latestCommit.slice(0, 7)}`
        );
        const commits = getCommitMessages(
          record.repoOwner,
          record.repoName,
          currentCommit,
          latestCommit,
          3
        );
        for (const commit of commits) {
          logger.dim(`    ${commit}`);
        }
      } else {
        const { record, update: mp } = update;
        logger.log(
          `  ${record.name} (${record.agent}): ${record.marketplaceVersion} → ${mp.latestVersion}`
        );
        logger.dim(`    hash: ${mp.currentHash.slice(0, 12)} → ${mp.latestHash.slice(0, 12)}`);
        if (mp.changelog) {
          logger.dim(`    ${mp.changelog}`);
        }
      }
    }
    logger.newline();

    if (options.check) {
      return;
    }

    // Let user select which to update
    const choices = updates.map((u) => {
      if (u.source === "git") {
        return {
          name: u.record.name,
          hint: `${u.record.agent} · ${u.currentCommit.slice(0, 7)} → ${u.latestCommit.slice(0, 7)}`,
          value: u,
        };
      }
      return {
        name: u.record.name,
        hint: `${u.record.agent} · ${u.record.marketplaceVersion} → ${u.update.latestVersion}`,
        value: u,
      };
    });

    const selected = await autocomplete<SkillUpdate>(
      "Search and select skills to update (space to select, enter to confirm):",
      choices,
      { multiple: true }
    );

    if (selected.length === 0) {
      logger.warn("No skills selected. Update cancelled.");
      return;
    }

    // Perform updates
    logger.newline();
    for (const item of selected) {
      if (item.source === "git") {
        await applyGitUpdate(item);
      } else {
        await applyMarketplaceUpdate(item, options.server);
      }
    }
  });

// ---------------------------------------------------------------------------
// Git update checking
// ---------------------------------------------------------------------------

async function checkGitUpdates(skills: InstalledSkillRecord[]): Promise<GitSkillUpdate[]> {
  const repoMap = new Map<string, InstalledSkillRecord[]>();
  for (const skill of skills) {
    const key = `${skill.repoOwner}/${skill.repoName}`;
    if (!repoMap.has(key)) repoMap.set(key, []);
    repoMap.get(key)!.push(skill);
  }

  const repoCount = repoMap.size;
  let checkedCount = 0;
  const spinner = createSpinner(`Checking git repos (0/${repoCount})...`);
  const updates: GitSkillUpdate[] = [];

  for (const [repoKey, repoSkills] of repoMap) {
    checkedCount++;
    spinner.update(`Checking git repos (${checkedCount}/${repoCount}): ${repoKey}...`);

    const [owner, repo] = repoKey.split("/");
    if (!owner || !repo) continue;

    const result = await updateRepo(owner, repo);
    if (!result.success) {
      logger.warn(`Failed to check ${repoKey}: ${result.error}`);
      continue;
    }

    const latestCommit = await getRepoCommit(owner, repo);
    if (!latestCommit) continue;

    for (const skill of repoSkills) {
      if (skill.commitHash !== latestCommit) {
        updates.push({
          source: "git",
          record: skill,
          currentCommit: skill.commitHash,
          latestCommit,
        });
      }
    }
  }

  spinner.stop(
    updates.length > 0 ? `Found ${updates.length} git update(s)` : "Git skills up to date"
  );
  return updates;
}

async function applyGitUpdate(update: GitSkillUpdate): Promise<void> {
  const { record, latestCommit } = update;
  const agent = getAgent(record.agent);
  if (!agent) return;

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
    return;
  }

  const skill = loadSkillFromDir(skillPath);
  if (!skill) {
    logger.warn(`Could not load ${record.name}`);
    return;
  }

  await agent.installSkill(skill, skillPath, undefined, record.scope);

  addSkillRecord({
    ...record,
    commitHash: latestCommit,
    installedAt: new Date().toISOString(),
  });

  trackUpdate(record.name, record.commitHash.slice(0, 7), latestCommit.slice(0, 7));
  logger.success(`Updated ${record.name} → ${record.agent}`);
}

// ---------------------------------------------------------------------------
// Marketplace update checking
// ---------------------------------------------------------------------------

async function checkMarketplaceSkillUpdates(
  skills: InstalledSkillRecord[],
  serverOverride?: string
): Promise<MarketplaceSkillUpdate[]> {
  const spinner = createSpinner(`Checking marketplace (0/${skills.length})...`);

  const mpUpdates = await checkMarketplaceUpdates(skills, {
    server: serverOverride,
    onProgress: (checked, total) => {
      spinner.update(`Checking marketplace (${checked}/${total})...`);
    },
  });

  const updates: MarketplaceSkillUpdate[] = mpUpdates.map((mp) => ({
    source: "marketplace" as const,
    record: skills.find((s) => s.marketplaceSlug === mp.slug)!,
    update: mp,
  }));

  spinner.stop(
    updates.length > 0
      ? `Found ${updates.length} marketplace update(s)`
      : "Marketplace skills up to date"
  );
  return updates;
}

async function applyMarketplaceUpdate(
  update: MarketplaceSkillUpdate,
  serverOverride?: string
): Promise<void> {
  const { record, update: mp } = update;
  // Track as update (installFromMarketplace tracks as install, but this is an update)
  trackUpdate(mp.slug, record.marketplaceVersion, mp.latestVersion);
  try {
    await installFromMarketplace(mp.slug, {
      agent: record.agent,
      scope: record.scope,
      server: serverOverride,
    });
  } catch (err) {
    logger.error(
      `Failed to update ${record.name}: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}
