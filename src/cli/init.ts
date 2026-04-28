import { Command } from "commander";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { input, closePrompt } from "../utils/prompt.js";
import { validateSkillName, validateSkillDescription } from "../core/skill.js";
import { safeJoinPath } from "../utils/fs.js";
import { logger } from "../utils/logger.js";

export const initCommand = new Command("init")
  .description("Create a new skill")
  .argument("[name]", "Skill name")
  .option("-d, --dir <path>", "Directory to create skill in", ".")
  .option("--description <text>", "Skill description (skips the description prompt)")
  .option("-y, --yes", "Non-interactive: fail if required fields are missing instead of prompting")
  .addHelpText(
    "after",
    `
Examples:
  $ osk init                   # Interactive creation
  $ osk init my-skill          # Create with name
  $ osk init my-skill -d ./skills  # Create in specific directory
`
  )
  .action(async (name: string | undefined, options) => {
    try {
      let skillName = name;

      if (!skillName) {
        if (options.yes) {
          logger.error("Skill name is required in non-interactive mode. Pass it as an argument.");
          process.exit(1);
        }
        skillName = await input("Skill name:", (value: string) => {
          const result = validateSkillName(value);
          return result.valid || result.error || "Invalid name";
        });
      } else {
        const validation = validateSkillName(skillName);
        if (!validation.valid) {
          logger.error(`Invalid skill name: ${validation.error}`);
          process.exit(1);
        }
      }

      let description: string;
      if (options.description) {
        const validation = validateSkillDescription(options.description);
        if (!validation.valid) {
          logger.error(`Invalid description: ${validation.error}`);
          process.exit(1);
        }
        description = options.description;
      } else if (options.yes) {
        logger.error("--description is required in non-interactive mode (-y).");
        process.exit(1);
      } else {
        description = await input("Description:", (value: string) => {
          const result = validateSkillDescription(value);
          return result.valid || result.error || "Invalid description";
        });
      }

      const skillDir = safeJoinPath(options.dir, skillName);
      if (!skillDir) {
        logger.error(`Invalid skill name: ${skillName}`);
        process.exit(1);
      }

      try {
        // Create directory - will throw if it exists (prevents race condition)
        mkdirSync(skillDir, { recursive: false });
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "EEXIST") {
          logger.error(`Directory already exists: ${skillDir}`);
          process.exit(1);
        }
        // For other errors, try recursive creation (parent dir might not exist)
        try {
          mkdirSync(skillDir, { recursive: true });
        } catch {
          logger.error(`Failed to create directory: ${skillDir}`);
          logger.dim("Check that you have write permissions to the parent directory");
          process.exit(1);
        }
      }

      const skillMd = `---
name: ${skillName}
description: ${description}
license: MIT
metadata:
  author: ""
  version: "1.0.0"
---

# ${skillName}

Add your skill instructions here.

## When to Use

Describe when this skill should be activated.

## Instructions

1. Step one
2. Step two

## Examples

- Example usage
`;

      writeFileSync(join(skillDir, "SKILL.md"), skillMd, "utf-8");

      logger.success(`Created skill: ${skillDir}`);
      logger.dim("Edit SKILL.md to add your instructions");
    } finally {
      closePrompt();
    }
  });
