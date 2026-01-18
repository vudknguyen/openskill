import { Command } from "commander";
import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { join, basename } from "path";
import { parseSkillMd } from "../utils/markdown.js";
import { validateSkillName, validateSkillDescription } from "../core/skill.js";
import { logger } from "../utils/logger.js";

export const validateCommand = new Command("validate")
  .description("Validate skill format")
  .argument("[path]", "Path to skill or directory of skills", ".")
  .option("--strict", "Enable strict validation")
  .addHelpText(
    "after",
    `
Examples:
  $ osk validate               # Validate current directory
  $ osk validate ./my-skill    # Validate specific skill
  $ osk validate --strict      # Strict validation
`
  )
  .action(async (path: string, options) => {
    let stats;
    try {
      stats = statSync(path);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        logger.error(`Path not found: ${path}`);
      } else if ((err as NodeJS.ErrnoException).code === "EACCES") {
        logger.error(`Permission denied: ${path}`);
      } else {
        logger.error(`Cannot access path: ${path}`);
      }
      process.exit(1);
    }

    if (stats.isFile()) {
      validateFile(path, options.strict);
    } else if (stats.isDirectory()) {
      validateDirectory(path, options.strict);
    } else {
      logger.error(`Invalid path type: ${path}`);
      process.exit(1);
    }
  });

function validateFile(filePath: string, strict: boolean): void {
  if (!filePath.endsWith("SKILL.md")) {
    logger.warn(`Skipping non-SKILL.md file: ${filePath}`);
    return;
  }

  const content = readFileSync(filePath, "utf-8");
  const errors: string[] = [];

  try {
    const parsed = parseSkillMd(content);

    // Validate name
    const nameResult = validateSkillName(parsed.frontmatter.name);
    if (!nameResult.valid) {
      errors.push(`name: ${nameResult.error}`);
    }

    // Check name matches directory
    const dirName = basename(join(filePath, ".."));
    if (parsed.frontmatter.name !== dirName && strict) {
      errors.push(`name "${parsed.frontmatter.name}" does not match directory "${dirName}"`);
    }

    // Validate description
    const descResult = validateSkillDescription(parsed.frontmatter.description);
    if (!descResult.valid) {
      errors.push(`description: ${descResult.error}`);
    }

    // Check content
    if (!parsed.content || parsed.content.trim().length === 0) {
      errors.push("Skill has no instructions content");
    }

    // Strict checks
    if (strict) {
      if (!parsed.frontmatter.license) {
        errors.push("Missing license field (recommended)");
      }

      const lines = parsed.content.split("\n").length;
      if (lines > 500) {
        errors.push(
          `Content exceeds 500 lines (${lines} lines). Consider splitting into smaller, focused skills`
        );
      }
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  if (errors.length > 0) {
    logger.error(`${filePath}:`);
    for (const error of errors) {
      logger.dim(`  - ${error}`);
    }
  } else {
    logger.success(`${filePath}: Valid`);
  }
}

function validateDirectory(dirPath: string, strict: boolean): void {
  const skillMdPath = join(dirPath, "SKILL.md");

  if (existsSync(skillMdPath)) {
    // Single skill directory
    validateFile(skillMdPath, strict);
    return;
  }

  // Look for subdirectories with SKILL.md
  const entries = readdirSync(dirPath, { withFileTypes: true });
  let foundSkills = false;

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const subSkillMd = join(dirPath, entry.name, "SKILL.md");
      if (existsSync(subSkillMd)) {
        validateFile(subSkillMd, strict);
        foundSkills = true;
      }
    }
  }

  if (!foundSkills) {
    logger.warn(`No skills found in ${dirPath}`);
  }
}
