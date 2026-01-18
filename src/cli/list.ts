import { Command } from "commander";
import {
  Agent,
  getAgent,
  getAllAgents,
  getAgentNames,
  InstallScope,
  InstalledSkill,
} from "../agents/index.js";
import { getAllInstalledSkills, getSkillRecord } from "../core/manifest.js";
import { getScopeLabel } from "../utils/fs.js";
import { logger } from "../utils/logger.js";

export const listCommand = new Command("list")
  .alias("ls")
  .description("List installed skills")
  .argument("[name]", "Agent name or skill name")
  .option("-g, --global", "List global skills only (~/.{agent}/skills/)")
  .option("-a, --all", "List both project and global skills")
  .addHelpText(
    "after",
    `
Examples:
  $ osk ls                     # List project skills (all agents)
  $ osk ls -g                  # List global skills
  $ osk ls --all               # List both project and global
  $ osk ls claude              # List skills for Claude
  $ osk ls pdf                 # Show detailed info for a skill
`
  )
  .action(async (nameArg: string | undefined, options) => {
    const agentNames = getAgentNames();

    // Determine scope
    let scope: InstallScope | undefined;
    if (options.all) {
      scope = undefined; // Show both
    } else if (options.global) {
      scope = "global";
    } else {
      scope = "project";
    }

    // If no argument, show all skills from all agents
    if (!nameArg) {
      await listAllSkills(scope);
      return;
    }

    // Check if argument is an agent name
    if (agentNames.includes(nameArg)) {
      await listAgentSkills(nameArg, scope);
      return;
    }

    // Otherwise, treat as skill name and show detailed info
    await showSkillDetail(nameArg, scope);
  });

/**
 * Display skills grouped by project/global scope for an agent.
 */
function displayAgentSkills(agent: Agent, skills: InstalledSkill[], scope?: InstallScope): void {
  const projectSkills = skills.filter((s) => s.source === "project");
  const globalSkills = skills.filter((s) => s.source === "global");

  if (projectSkills.length > 0 && (!scope || scope === "project")) {
    logger.dim(`Project: ${agent.getSkillPath()}`);
    for (const skill of projectSkills) {
      const record = getSkillRecord(skill.name, agent.name, "project");
      const version = skill.version || record?.commitHash?.slice(0, 7) || "-";
      logger.skillCompact(skill.name, version, agent.icon, agent.color);
    }
  }

  if (globalSkills.length > 0 && (!scope || scope === "global")) {
    logger.dim(`Global: ${agent.getGlobalSkillPath()}`);
    for (const skill of globalSkills) {
      const record = getSkillRecord(skill.name, agent.name, "global");
      const version = skill.version || record?.commitHash?.slice(0, 7) || "-";
      logger.skillCompact(skill.name, version, agent.icon, agent.color, "global");
    }
  }
}

async function listAllSkills(scope?: InstallScope): Promise<void> {
  let hasSkills = false;
  // For --all (undefined scope), show both scopes checked; otherwise use standard label
  const scopeLabel = scope === undefined ? " (project or global)" : getScopeLabel(scope);

  for (const agent of getAllAgents()) {
    const skills = await agent.listSkills(undefined, scope);
    if (skills.length > 0) {
      hasSkills = true;
      logger.header(`${agent.displayName}`);
      displayAgentSkills(agent, skills, scope);
      logger.newline();
    }
  }

  if (!hasSkills) {
    logger.info(`No skills installed${scopeLabel}`);
    logger.dim("Install skills with: osk install <repository>");
  }
}

async function listAgentSkills(agentName: string, scope?: InstallScope): Promise<void> {
  const agent = getAgent(agentName);
  if (!agent) {
    logger.error(`Invalid agent: ${agentName}`);
    process.exit(1);
  }

  const skills = await agent.listSkills(undefined, scope);
  // For --all (undefined scope), show both scopes checked; otherwise use standard label
  const scopeLabel = scope === undefined ? " (project or global)" : getScopeLabel(scope);

  if (skills.length === 0) {
    logger.info(`No skills installed${scopeLabel} for ${agent.displayName}`);
    return;
  }

  logger.header(`${agent.displayName}`);
  displayAgentSkills(agent, skills, scope);
}

async function showSkillDetail(skillName: string, scope?: InstallScope): Promise<void> {
  const manifest = getAllInstalledSkills();
  const installations = manifest.filter((s) => {
    if (s.name !== skillName) return false;
    if (scope) return (s.scope ?? "project") === scope;
    return true;
  });

  if (installations.length === 0) {
    // Check if skill exists in any agent but not in manifest
    let found = false;
    for (const agent of getAllAgents()) {
      const skills = await agent.listSkills(undefined, scope);
      const matchingSkills = skills.filter((s) => s.name === skillName);
      for (const skill of matchingSkills) {
        found = true;
        const scopeLabel = skill.source === "global" ? " (global)" : "";
        logger.header(`${skill.name}${scopeLabel}`);
        logger.log(`  Agent:       ${agent.displayName}`);
        logger.log(`  Scope:       ${skill.source || "project"}`);
        logger.log(`  Path:        ${skill.path}`);
        logger.log(`  Version:     ${skill.version || "(unknown)"}`);
        logger.newline();
        logger.dim(`  ${skill.description}`);
        logger.newline();
      }
    }

    if (!found) {
      logger.error(`Skill not installed: ${skillName}`);
      logger.dim("List installed skills with: osk ls");
      process.exit(1);
    }
    return;
  }

  // Show detailed info for each installation
  for (const record of installations) {
    const agent = getAgent(record.agent);
    if (!agent) continue;

    const recordScope = record.scope ?? "project";
    const skills = await agent.listSkills(undefined, recordScope);
    const skill = skills.find((s) => s.name === skillName);
    const scopeLabel = recordScope === "global" ? " (global)" : "";
    const path = recordScope === "global" ? agent.getGlobalSkillPath() : agent.getSkillPath();

    logger.header(`${record.name}${scopeLabel}`);
    logger.log(`  Agent:       ${agent.displayName}`);
    logger.log(`  Scope:       ${recordScope}`);
    logger.log(`  Source:      ${record.repoOwner}/${record.repoName}`);
    logger.log(`  Version:     ${record.commitHash.slice(0, 7)}`);
    logger.log(`  Installed:   ${new Date(record.installedAt).toLocaleDateString()}`);
    logger.log(`  Path:        ${path}/${record.name}`);
    logger.newline();

    if (skill) {
      logger.dim(`  ${skill.description}`);
      logger.newline();
    }
  }
}
