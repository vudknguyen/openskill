import { Command } from "commander";
import { getAgent, getAllAgents, getAgentNames, InstallScope } from "../agents/index.js";
import { removeSkillRecord } from "../core/manifest.js";
import { getScopeLabel } from "../utils/fs.js";
import { select, confirm } from "../utils/prompt.js";
import { logger } from "../utils/logger.js";

export const uninstallCommand = new Command("uninstall")
  .alias("rm")
  .description("Uninstall a skill")
  .argument("<skill-or-agent>", "Skill name or agent name")
  .argument("[skill]", "Skill name (when first arg is agent)")
  .option("-a, --all", "Uninstall from all agents")
  .option("-g, --global", "Uninstall from global directory (~/.{agent}/skills/)")
  .option("-y, --yes", "Skip confirmation prompt")
  .addHelpText(
    "after",
    `
Examples:
  $ osk rm pdf                 # Remove skill
  $ osk rm pdf -y              # Skip confirmation
  $ osk rm pdf -g              # Remove from global directory
  $ osk rm claude pdf          # Remove from specific agent
  $ osk rm pdf -a              # Remove from all agents
`
  )
  .action(async (first: string, second: string | undefined, options) => {
    const agentNames = getAgentNames();
    const isFirstAgent = agentNames.includes(first);
    const scope: InstallScope = options.global ? "global" : "project";
    const scopeLabel = getScopeLabel(scope);

    let agentName: string | undefined;
    let skillName: string;

    if (second) {
      // osk uninstall <agent> <skill>
      if (!isFirstAgent) {
        logger.error(`Invalid agent: ${first}`);
        logger.dim(`Available agents: ${agentNames.join(", ")}`);
        process.exit(1);
      }
      agentName = first;
      skillName = second;
    } else {
      // osk uninstall <skill> [-a]
      skillName = first;
    }

    if (options.all) {
      // Show what will be removed
      const toRemove: string[] = [];
      for (const agent of getAllAgents()) {
        const skills = await agent.listSkills(undefined, scope);
        if (skills.some((s) => s.name === skillName)) {
          toRemove.push(agent.displayName);
        }
      }

      if (toRemove.length === 0) {
        logger.warn(`Skill ${skillName} is not installed${scopeLabel} for any agent`);
        return;
      }

      logger.info(`Will remove ${skillName}${scopeLabel} from: ${toRemove.join(", ")}`);

      if (!options.yes) {
        const confirmed = await confirm(`Remove ${skillName}${scopeLabel} from all agents?`);
        if (!confirmed) {
          logger.cancelled();
          return;
        }
      }

      for (const agent of getAllAgents()) {
        const success = await agent.uninstallSkill(skillName, undefined, scope);
        if (success) {
          removeSkillRecord(skillName, agent.name, scope);
          logger.success(`Uninstalled ${skillName} from ${agent.displayName}${scopeLabel}`);
        }
      }
      return;
    }

    // If no agent specified, find agents that have the skill and prompt
    if (!agentName) {
      const allAgents = getAllAgents();
      const agentsWithSkill: typeof allAgents = [];

      for (const a of allAgents) {
        const skills = await a.listSkills(undefined, scope);
        if (skills.some((s) => s.name === skillName)) {
          agentsWithSkill.push(a);
        }
      }

      if (agentsWithSkill.length === 0) {
        logger.warn(`Skill ${skillName} is not installed${scopeLabel} for any agent`);
        return;
      }

      if (agentsWithSkill.length === 1) {
        agentName = agentsWithSkill[0].name;
      } else {
        agentName = await select(
          "Select agent to uninstall from:",
          agentsWithSkill.map((a) => ({
            name: a.displayName,
            value: a.name,
          }))
        );
      }
    }

    const agent = getAgent(agentName);

    if (!agent) {
      logger.error(`Invalid agent: ${agentName}`);
      process.exit(1);
    }

    // Check if skill exists (needed when agent was specified directly)
    const skills = await agent.listSkills(undefined, scope);
    if (!skills.some((s) => s.name === skillName)) {
      logger.warn(`Skill ${skillName} is not installed${scopeLabel} for ${agent.displayName}`);
      return;
    }

    if (!options.yes) {
      const confirmed = await confirm(
        `Remove ${skillName} from ${agent.displayName}${scopeLabel}?`
      );
      if (!confirmed) {
        logger.cancelled();
        return;
      }
    }

    const success = await agent.uninstallSkill(skillName, undefined, scope);

    if (success) {
      removeSkillRecord(skillName, agentName, scope);
      logger.success(`Uninstalled ${skillName} from ${agent.displayName}${scopeLabel}`);
    }
  });
