import { Command } from "commander";
import { getAllAgents } from "../agents/index.js";
import { logger } from "../utils/logger.js";

export const whichCommand = new Command("which")
  .description("Show installation path for a skill")
  .argument("<skill>", "Skill name")
  .addHelpText(
    "after",
    `
Examples:
  $ osk which pdf              # Show where pdf skill is installed
`
  )
  .action(async (skillName: string) => {
    let found = false;

    for (const agent of getAllAgents()) {
      // Check both project and global scopes
      const skills = await agent.listSkills(undefined, undefined); // Get all scopes

      const projectSkill = skills.find((s) => s.name === skillName && s.source === "project");
      const globalSkill = skills.find((s) => s.name === skillName && s.source === "global");

      if (projectSkill || globalSkill) {
        found = true;
        logger.log(`${agent.color}${agent.icon}${"\x1b[0m"} ${agent.displayName}`);

        if (projectSkill) {
          logger.log(`  Project: ${projectSkill.path}`);
        }
        if (globalSkill) {
          logger.log(`  Global:  ${globalSkill.path}`);
        }
        logger.newline();
      }
    }

    if (!found) {
      logger.error(`Skill not found: ${skillName}`);
      logger.dim("List installed skills with: osk ls --all");
      process.exit(1);
    }
  });
