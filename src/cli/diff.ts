import { Command } from "commander";
import { existsSync } from "fs";
import { join } from "path";
import { getAgent, getAllAgents, type InstallScope } from "../agents/index.js";
import { getSkillRecord } from "../core/manifest.js";
import { createMarketplaceClient } from "../core/marketplace-client.js";
import { getScopeLabel } from "../utils/fs.js";
import { logger } from "../utils/logger.js";

export const diffCommand = new Command("diff")
  .description("Show what changed in a skill since your installed version")
  .argument("<skill>", "Skill name")
  .option("-a, --agent <agent>", "Agent to check")
  .option("-g, --global", "Check global install")
  .addHelpText(
    "after",
    `
Examples:
  $ osk diff my-skill            # Show changes since installed version
  $ osk diff my-skill -a claude  # Check specific agent
  $ osk diff my-skill -g         # Check global install
`
  )
  .action(async (skillName: string, options: { agent?: string; global?: boolean }) => {
    const scope: InstallScope = options.global ? "global" : "project";

    // Find which agent has this skill installed
    let agentName = options.agent;
    let foundScope = scope;

    if (!agentName) {
      for (const agent of getAllAgents()) {
        // Check requested scope first
        const skills = await agent.listSkills(undefined, scope);
        if (skills.some((s) => s.name === skillName)) {
          agentName = agent.name;
          foundScope = scope;
          break;
        }
        // Also check the other scope if not found
        if (!options.global) {
          const globalSkills = await agent.listSkills(undefined, "global");
          if (globalSkills.some((s) => s.name === skillName)) {
            agentName = agent.name;
            foundScope = "global";
            break;
          }
        }
      }
    }

    if (!agentName) {
      logger.error(`Skill "${skillName}" is not installed for any agent`);
      return;
    }

    const agent = getAgent(agentName);
    if (!agent) {
      logger.error(`Unknown agent: ${agentName}`);
      return;
    }

    const record = getSkillRecord(skillName, agentName, foundScope);
    if (!record) {
      logger.error(`No install record for "${skillName}" on ${agentName}`);
      return;
    }

    // Find the SKILL.md from the installed skill's actual path
    const skills = await agent.listSkills(undefined, foundScope);
    const installed = skills.find((s) => s.name === skillName);

    if (!installed) {
      logger.error(
        `Skill "${skillName}" not found in ${agent.displayName}${getScopeLabel(foundScope)}`
      );
      return;
    }

    // Use the skill's actual path from listSkills
    const skillMdPath = join(installed.path, "SKILL.md");
    if (!existsSync(skillMdPath)) {
      logger.error(`Installed SKILL.md not found at ${skillMdPath}`);
      return;
    }

    if (record.source === "marketplace" && record.marketplaceSlug) {
      // Marketplace skill: fetch latest from API
      try {
        const client = createMarketplaceClient();
        const metadata = await client.getSkillDownload(record.marketplaceSlug);

        if (metadata.fileHash === record.commitHash) {
          logger.success(`${skillName} is up to date (${record.marketplaceVersion})`);
          return;
        }

        logger.info(`${skillName}: update available`);
        logger.dim(`  Installed: ${record.marketplaceVersion || record.commitHash?.slice(0, 8)}`);
        logger.dim(`  Latest:    ${metadata.version}`);
        logger.newline();
        logger.dim("Run 'osk update' to apply the update.");
      } catch (err) {
        logger.error(
          `Failed to check for updates: ${err instanceof Error ? err.message : String(err)}`
        );
        process.exitCode = 1;
      }
    } else {
      // Git skill: show installed version info
      logger.info(`${skillName} (git install)`);
      logger.dim(`  Installed from: ${record.repoOwner}/${record.repoName}`);
      logger.dim(`  Commit: ${record.commitHash?.slice(0, 8) || "unknown"}`);
      logger.dim(`  Installed: ${record.installedAt}`);
      logger.newline();
      logger.dim("Run 'osk update' to check for git updates.");
    }
  });
