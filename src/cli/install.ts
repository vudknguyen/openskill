import { Command } from "commander";
import { existsSync } from "fs";
import { join } from "path";
import { autocomplete, confirm, closePrompt } from "../utils/prompt.js";
import { getAgent, getAllAgents, getAgentNames, InstallScope } from "../agents/index.js";
import { loadConfig } from "../core/config.js";
import { cloneRepo, getRepoCommit } from "../core/git.js";
import { loadSkillFromDir, discoverSkills, SkillInfo } from "../core/skill.js";
import { searchSkills } from "../core/registry.js";
import { addSkillRecord } from "../core/manifest.js";
import { installFromMarketplace } from "../core/marketplace-installer.js";
import { parseGitUrl, safeJoinPath, getScopeLabel } from "../utils/fs.js";
import { logger, createSpinner } from "../utils/logger.js";
import { trackInstall } from "../core/telemetry.js";
import { getValidAuth } from "../core/token-refresh.js";
import { createMarketplaceClient } from "../core/marketplace-client.js";

interface InstallContext {
  /** Repository owner/namespace (e.g., "anthropics") */
  owner: string;
  /** Repository name (e.g., "skills") */
  repo: string;
  /** Git commit hash */
  commitHash: string;
  /** Clone URL for the repository */
  cloneUrl?: string;
}

export const installCommand = new Command("install")
  .alias("i")
  .description("Install a skill from a repository")
  .argument("<source>", "Repository (owner/repo or URL) or skill name to search")
  .argument("[skill]", "Specific skill name to install from repository")
  .option("-t, --target <agent>", "Target agent (claude, cursor, codex, antigravity)")
  .option("-a, --all", "Install all skills from repository (requires -t/--target)")
  .option("-g, --global", "Install to global directory (~/.{agent}/skills/)")
  .option("-m, --marketplace", "Install from the OpenSkill marketplace")
  .option("--version <version>", "Specific marketplace version to install")
  .option("-y, --yes", "Skip interactive prompts, use defaults")
  .option("--org <org>", "Install from organization's skill registry")
  .addHelpText(
    "after",
    `
Examples:
  $ osk install anthropics/skills              # Interactive install
  $ osk install anthropics/skills pdf          # Install specific skill
  $ osk install anthropics/skills -t claude    # Install to specific agent
  $ osk install anthropics/skills -a -t cursor # Install all to Cursor
  $ osk install anthropics/skills pdf -g       # Install to global directory
  $ osk install https://gitlab.com/user/repo   # Install from GitLab
  $ osk install git@github.com:user/repo.git   # Install via SSH
  $ osk install pdf                            # Search and install by name
  $ osk install pdf-reader -m                  # Install from marketplace
  $ osk install pdf-reader -m --version 1.0.0  # Specific marketplace version
  $ osk install pdf-reader --org my-team       # Install from org registry
`
  )
  .action(async (source: string, skillArg: string | undefined, options) => {
    try {
      const agentNames = getAgentNames();

      // Validate --target agent if provided
      if (options.target && !agentNames.includes(options.target)) {
        logger.error(`Invalid agent: ${options.target}`);
        logger.dim(`Available agents: ${agentNames.join(", ")}`);
        process.exit(1);
      }

      // Validate -a requires --target
      if (options.all && !options.target) {
        logger.error("Flag -a (--all) requires specifying a target agent");
        logger.dim(`Usage: osk install <repository> -a -t <agent>`);
        logger.dim(`Example: osk install anthropics/skills -a -t claude`);
        process.exit(1);
      }

      const scope: InstallScope = options.global ? "global" : "project";

      // Resolve org: explicit --org flag or defaultOrg from config
      const orgSlug = options.org || loadConfig().defaultOrg;

      // Org registry install path
      if (orgSlug) {
        try {
          await installFromOrgRegistry(source, orgSlug, {
            agent: options.target,
            version: options.version,
            scope,
          });
        } catch (err) {
          logger.error(err instanceof Error ? err.message : String(err));
          process.exit(1);
        }
        return;
      }

      // Marketplace install path
      if (options.marketplace) {
        try {
          await installFromMarketplace(source, {
            agent: options.target,
            version: options.version,
            scope,
          });
        } catch (err) {
          logger.error(err instanceof Error ? err.message : String(err));
          process.exit(1);
        }
        return;
      }

      const parsed = parseGitUrl(source);

      if (parsed) {
        // Full Git URL (HTTPS, SSH, git://, or owner/repo shorthand)
        await installFromGitHub(parsed.owner, parsed.repo, parsed.path, {
          agent: options.target,
          skillName: skillArg,
          installAllSkills: options.all,
          yes: options.yes,
          scope,
          cloneUrl: parsed.cloneUrl,
        });
      } else if (source.includes("/")) {
        // owner/repo/path format (GitHub shorthand with path)
        const parts = source.split("/");
        if (parts.length >= 2) {
          const [owner, repo, ...skillPath] = parts;
          await installFromGitHub(owner, repo, skillPath.join("/") || undefined, {
            agent: options.target,
            skillName: skillArg,
            installAllSkills: options.all,
            yes: options.yes,
            scope,
          });
        } else {
          logger.error(`Invalid source format: ${source}`);
          process.exit(1);
        }
      } else {
        // Search by skill name
        await installByName(source, { agent: options.target, yes: options.yes, scope });
      }
    } finally {
      closePrompt();
    }
  });

async function selectAgents(options: { agent?: string; yes?: boolean }): Promise<string[]> {
  if (options.agent) {
    return [options.agent];
  }

  if (options.yes) {
    const config = loadConfig();
    return [config.defaultAgent];
  }

  const agents = getAllAgents();
  const selected = await autocomplete(
    "Select target agent(s) (space to select, enter to confirm):",
    agents.map((a) => ({
      name: a.displayName,
      hint: a.getSkillPath(),
      value: a.name,
    })),
    { multiple: true }
  );

  return selected;
}

async function selectSkills(
  skills: SkillInfo[],
  options: { skillName?: string; installAllSkills?: boolean; yes?: boolean }
): Promise<SkillInfo[]> {
  if (skills.length === 0) {
    return [];
  }

  // If specific skill name provided, find it
  if (options.skillName) {
    const found = skills.find((s) => s.name === options.skillName);
    if (!found) {
      logger.error(`Skill not found: ${options.skillName}`);
      const skillNames = skills.map((s) => s.name);
      if (skillNames.length <= 10) {
        logger.dim(`Available skills: ${skillNames.join(", ")}`);
      } else {
        logger.dim(
          `Available skills: ${skillNames.slice(0, 10).join(", ")}, and ${skillNames.length - 10} more`
        );
        logger.dim(`Use 'osk browse' to see all skills`);
      }
      process.exit(1);
    }
    return [found];
  }

  // If -a flag, install all
  if (options.installAllSkills) {
    return skills;
  }

  if (skills.length === 1) {
    return skills;
  }

  // With --yes flag, use first skill (not all) for safe default
  if (options.yes) {
    return [skills[0]];
  }

  const selected = await autocomplete(
    "Search and select skill(s) to install (space to select, enter to confirm):",
    skills.map((s) => ({
      name: s.name,
      hint: s.description,
      value: s,
    })),
    { multiple: true }
  );

  return selected;
}

/**
 * Installs skills from a Git repository.
 * @param owner - Repository owner/namespace (e.g., "anthropics").
 * @param repo - Repository name (e.g., "skills").
 * @param skillPath - Optional path within the repository to a specific skill.
 * @param options - Installation options including optional cloneUrl for non-GitHub repos.
 * @returns Resolves when installation is complete.
 *
 * Note: Parameters use short names (owner, repo) for brevity.
 * Manifest records use longer names (repoOwner, repoName) for clarity in stored data.
 */
export async function installFromGitHub(
  owner: string,
  repo: string,
  skillPath: string | undefined,
  options: {
    agent?: string;
    skillName?: string;
    installAllSkills?: boolean;
    yes?: boolean;
    scope?: InstallScope;
    cloneUrl?: string;
  }
): Promise<void> {
  const scope = options.scope ?? "project";
  const spinner = createSpinner(`Fetching ${owner}/${repo}...`);

  const result = await cloneRepo(owner, repo, options.cloneUrl);
  if (!result.success) {
    spinner.stop();
    logger.error(`Failed to clone repository: ${result.error}`);
    logger.dim("Check that the repository exists and you have network access");
    process.exit(1);
  }
  spinner.stop(`Fetched ${owner}/${repo}`);

  const commitHash = (await getRepoCommit(owner, repo)) || "unknown";
  const context: InstallContext = { owner, repo, commitHash, cloneUrl: options.cloneUrl };

  let skillsBasePath = result.path;

  if (skillPath) {
    const safePath = safeJoinPath(result.path, skillPath);
    if (!safePath) {
      logger.error(`Invalid path: ${skillPath}`);
      process.exit(1);
    }
    skillsBasePath = safePath;
    if (!existsSync(skillsBasePath)) {
      logger.error(`Path not found: ${skillPath}`);
      process.exit(1);
    }
  }

  const skillMdPath = join(skillsBasePath, "SKILL.md");
  let availableSkills: SkillInfo[] = [];

  if (existsSync(skillMdPath)) {
    // Direct path to a single skill
    const skill = loadSkillFromDir(skillsBasePath);
    if (skill) {
      availableSkills = [
        {
          name: skill.frontmatter.name,
          description: skill.frontmatter.description,
          path: skillsBasePath,
          relativePath: skillPath || "",
        },
      ];
    }
  } else {
    // Search for skills recursively from the base path
    availableSkills = discoverSkills(skillsBasePath);
  }

  if (availableSkills.length === 0) {
    logger.error("No skills found in repository");
    logger.dim("Ensure the repository contains SKILL.md files in the root or skills/ directory");
    process.exit(1);
  }

  logger.info(`Found ${availableSkills.length} skill(s)`);

  const selectedSkills = await selectSkills(availableSkills, options);
  if (selectedSkills.length === 0) {
    logger.warn("No skills selected. Installation cancelled.");
    logger.dim("Run the command again to retry selection");
    return;
  }

  const selectedAgents = await selectAgents(options);
  if (selectedAgents.length === 0) {
    logger.warn("No agents selected. Installation cancelled.");
    logger.dim("Run the command again to retry selection");
    return;
  }

  // Calculate total installations for progress
  const totalInstallations = selectedSkills.length * selectedAgents.length;
  let completedInstallations = 0;

  // Track installed skills for rollback on failure
  const installedSkills: Array<{ name: string; agent: string }> = [];

  logger.newline();
  try {
    for (const skillInfo of selectedSkills) {
      const skill = loadSkillFromDir(skillInfo.path);
      if (!skill) {
        completedInstallations += selectedAgents.length;
        continue;
      }

      for (const agentName of selectedAgents) {
        completedInstallations++;
        const agent = getAgent(agentName);
        if (!agent) continue;

        // Show progress for multiple installations
        if (totalInstallations > 1) {
          logger.dim(
            `[${completedInstallations}/${totalInstallations}] Installing ${skill.frontmatter.name}...`
          );
        }

        const validation = agent.validateSkill(skill);
        if (!validation.valid) {
          logger.warn(
            `${skill.frontmatter.name} not compatible with ${agent.displayName}: ${validation.errors.join(", ")}`
          );
          continue;
        }

        await agent.installSkill(skill, skillInfo.path, undefined, scope);

        // Track for potential rollback
        installedSkills.push({ name: skill.frontmatter.name, agent: agentName });

        // Record installation in manifest
        addSkillRecord({
          name: skill.frontmatter.name,
          agent: agentName,
          repoOwner: context.owner,
          repoName: context.repo,
          repoPath: skillPath,
          commitHash: context.commitHash,
          installedAt: new Date().toISOString(),
          scope,
        });

        // Track telemetry
        trackInstall(skill.frontmatter.name, undefined, {
          agent: agentName,
          source: "git",
          repo: `${context.owner}/${context.repo}`,
          scope,
        });

        logger.success(
          `Installed ${skill.frontmatter.name} → ${agent.displayName}${getScopeLabel(scope)}`
        );
      }
    }
  } catch (err) {
    // Rollback installed skills on failure
    if (installedSkills.length > 0) {
      logger.warn(
        `Installation failed, rolling back ${installedSkills.length} installed skill(s)...`
      );
      for (const { name, agent: agentName } of installedSkills) {
        const agent = getAgent(agentName);
        if (agent) {
          try {
            await agent.uninstallSkill(name, undefined, scope);
            logger.dim(`  Rolled back: ${name}`);
          } catch (rollbackErr) {
            logger.dim(
              `  Failed to rollback ${name}: ${rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr)}`
            );
          }
        }
      }
    }
    throw err;
  }
}

/**
 * Interactive skill selection and installation from search results.
 * @param skills - Array of skills to present for selection.
 * @returns Resolves when installation is complete.
 *
 * Shared by browse and search commands.
 */
export async function interactiveInstallFromSkills(
  skills: Array<{
    name: string;
    description: string;
    repoOwner: string;
    repoName: string;
    repo: string;
    skillPath: string;
  }>
): Promise<void> {
  const { truncate } = await import("../utils/fs.js");
  const { selectScope } = await import("../utils/prompt.js");

  const choices = skills.map((s) => ({
    name: s.name,
    hint: `${s.repo} \u2022 ${truncate(s.description, 40)}`,
    value: s,
  }));

  const selected = await autocomplete(
    "Select skill(s) to install (space to select, enter to confirm):",
    choices,
    { multiple: true }
  );

  if (selected && selected.length > 0) {
    logger.newline();
    const scope = await selectScope();
    logger.newline();

    for (const skill of selected) {
      await installFromGitHub(skill.repoOwner, skill.repoName, skill.skillPath, {
        skillName: skill.name,
        scope,
      });
    }
  }
}

/**
 * Interactive install from mixed search results (repos + marketplace).
 * Each item is tagged with its source so the correct installer is called.
 */
export async function interactiveInstallFromMixed(
  repoSkills: Array<{
    name: string;
    description: string;
    repoOwner: string;
    repoName: string;
    repo: string;
    skillPath: string;
  }>,
  marketplaceSkills: Array<{
    slug: string;
    name: string;
    description: string;
    shortDescription: string | null;
    authorName: string | null;
    auditStatus?: "pass" | "warning" | "fail" | "unscanned" | null;
  }>,
  githubSkills: Array<{
    name: string;
    description: string;
    repoFullName: string | null;
    stars: number | null;
    auditStatus?: "pass" | "warning" | "fail" | "unscanned" | null;
  }> = []
): Promise<void> {
  const { truncate } = await import("../utils/fs.js");
  const { selectScope } = await import("../utils/prompt.js");

  type RepoChoice = { source: "repo"; skill: (typeof repoSkills)[number] };
  type MarketChoice = { source: "marketplace"; skill: (typeof marketplaceSkills)[number] };
  type GitHubChoice = { source: "github"; skill: (typeof githubSkills)[number] };

  const choices: Array<{
    name: string;
    hint: string;
    value: RepoChoice | MarketChoice | GitHubChoice;
  }> = [];

  for (const s of marketplaceSkills) {
    choices.push({
      name: s.name,
      hint: `marketplace${s.authorName ? ` · ${s.authorName}` : ""} · ${truncate(s.shortDescription || s.description, 40)}`,
      value: { source: "marketplace", skill: s },
    });
  }

  for (const s of githubSkills) {
    choices.push({
      name: s.name,
      hint: `github · ${s.repoFullName || "unknown"}${s.stars ? ` · ★ ${s.stars}` : ""} · ${truncate(s.description, 40)}`,
      value: { source: "github", skill: s },
    });
  }

  for (const s of repoSkills) {
    choices.push({
      name: s.name,
      hint: `${s.repo} · ${truncate(s.description, 40)}`,
      value: { source: "repo", skill: s },
    });
  }

  if (choices.length === 0) return;

  const selected = await autocomplete(
    "Select skill(s) to install (space to select, enter to confirm):",
    choices,
    { multiple: true }
  );

  if (selected && selected.length > 0) {
    // Check for skills that haven't passed audit
    const unaudited = selected.filter((item) => {
      if (item.source === "repo") return false;
      const skill = item.skill as { auditStatus?: string | null; name: string };
      return skill.auditStatus && skill.auditStatus !== "pass";
    });

    if (unaudited.length > 0) {
      logger.newline();
      for (const item of unaudited) {
        const skill = item.skill as { name: string; auditStatus?: string | null };
        if (skill.auditStatus === "fail") {
          logger.warn(`${skill.name} has failed its security audit`);
        } else if (skill.auditStatus === "warning") {
          logger.warn(`${skill.name} has audit warnings`);
        } else if (skill.auditStatus === "unscanned") {
          logger.warn(`${skill.name} has not been audited`);
        }
      }
      const proceed = await confirm("Continue installing unaudited/failed skill(s)?");
      if (!proceed) {
        logger.dim("Installation cancelled");
        return;
      }
    }

    logger.newline();
    const scope = await selectScope();
    logger.newline();

    for (const item of selected) {
      if (item.source === "repo") {
        const s = item.skill as (typeof repoSkills)[number];
        await installFromGitHub(s.repoOwner, s.repoName, s.skillPath, {
          skillName: s.name,
          scope,
        });
      } else if (item.source === "github") {
        const s = item.skill as (typeof githubSkills)[number];
        if (s.repoFullName) {
          const [owner, repo] = s.repoFullName.split("/");
          await installFromGitHub(owner, repo, undefined, { scope });
        } else {
          logger.warn(`Cannot install ${s.name}: missing repository information`);
        }
      } else {
        const s = item.skill as (typeof marketplaceSkills)[number];
        await installFromMarketplace(s.slug, { scope });
      }
    }
  }
}

async function installByName(
  name: string,
  options: { agent?: string; yes?: boolean; scope?: InstallScope }
): Promise<void> {
  logger.info(`Searching for skill: ${name}...`);

  const { discoverSkills: discoverMarketplaceSkills } =
    await import("../core/marketplace-search.js");

  // Search local repos and marketplace in parallel
  const [repoResults, discoveredResults] = await Promise.all([
    searchSkills(name),
    discoverMarketplaceSkills(name).catch(() => []),
  ]);

  const marketplaceResults = discoveredResults.filter((s) => s.source === "openskill");
  const githubResults = discoveredResults.filter((s) => s.source === "github");

  const totalCount = repoResults.length + discoveredResults.length;

  if (totalCount === 0) {
    logger.error(`No skills found matching: ${name}`);
    logger.dim("Try updating repositories with: osk update --repos");
    process.exit(1);
  }

  // Exact match in marketplace — install directly
  const exactMarketplace = marketplaceResults.find(
    (s) =>
      s.slug.toLowerCase() === name.toLowerCase() || s.name.toLowerCase() === name.toLowerCase()
  );
  if (exactMarketplace) {
    await installFromMarketplace(exactMarketplace.slug, {
      agent: options.agent,
      scope: options.scope,
    });
    return;
  }

  // Exact match in local repos
  const exactRepo = repoResults.find((s) => s.name.toLowerCase() === name.toLowerCase());
  if (exactRepo) {
    await installFromGitHub(exactRepo.repoOwner, exactRepo.repoName, exactRepo.skillPath, options);
    return;
  }

  // Exact match in GitHub discovered
  const exactGithub = githubResults.find(
    (s) =>
      s.slug.toLowerCase() === name.toLowerCase() || s.name.toLowerCase() === name.toLowerCase()
  );
  if (exactGithub && exactGithub.repoFullName) {
    const [owner, repo] = exactGithub.repoFullName.split("/");
    await installFromGitHub(owner, repo, undefined, options);
    return;
  }

  // No exact match — present combined choices
  if (options.yes) {
    // In non-interactive mode, pick first available result
    if (marketplaceResults.length > 0) {
      await installFromMarketplace(marketplaceResults[0].slug, {
        agent: options.agent,
        scope: options.scope,
      });
    } else if (repoResults.length > 0) {
      await installFromGitHub(
        repoResults[0].repoOwner,
        repoResults[0].repoName,
        repoResults[0].skillPath,
        options
      );
    } else if (githubResults.length > 0 && githubResults[0].repoFullName) {
      const [owner, repo] = githubResults[0].repoFullName.split("/");
      await installFromGitHub(owner, repo, undefined, options);
    }
    return;
  }

  await interactiveInstallFromMixed(repoResults, marketplaceResults, githubResults);
}

// ============================================
// Org Registry Install
// ============================================

async function installFromOrgRegistry(
  skillSlug: string,
  orgSlugOrId: string,
  options: { agent?: string; version?: string; scope: InstallScope }
) {
  const auth = await getValidAuth();
  if (!auth) {
    throw new Error("Not logged in. Run 'osk login' first.");
  }

  const client = createMarketplaceClient();
  const spinner = createSpinner("Checking organization registry...");

  // Resolve org
  const orgs = await client.listOrgs(auth.accessToken);
  const org = orgs.find((o) => o.slug === orgSlugOrId || o.id === orgSlugOrId);
  if (!org) {
    spinner.stop("Organization not found");
    throw new Error(
      `Organization "${orgSlugOrId}" not found. Run 'osk org ls' to see your organizations.`
    );
  }

  // Check if skill is in org registry
  const result = await client.getOrgSkills(org.id, auth.accessToken);
  const orgSkill = result.skills.find((s) => s.skillSlug === skillSlug);
  if (!orgSkill) {
    spinner.stop("Skill not in org registry");
    const available = result.skills.map((s) => s.skillSlug).join(", ");
    throw new Error(
      `Skill "${skillSlug}" is not in ${org.name}'s registry.${available ? ` Available: ${available}` : " Registry is empty."}`
    );
  }

  // Check audit policy
  if (result.organization.requireAuditPass && orgSkill.skillAuditStatus !== "pass") {
    spinner.stop("Blocked by audit policy");
    throw new Error(
      `Skill "${skillSlug}" has audit status "${orgSkill.skillAuditStatus}". ` +
        `Organization policy requires skills to pass audit. Contact your org admin.`
    );
  }

  spinner.stop(`Found "${orgSkill.skillName}" in ${org.name}'s registry`);

  // Install via marketplace (the skill is a marketplace skill linked to the org)
  await installFromMarketplace(skillSlug, {
    agent: options.agent,
    version: options.version,
    scope: options.scope,
  });

  logger.dim(`  Installed from ${org.name}'s org registry`);
}
