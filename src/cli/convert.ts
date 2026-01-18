import { Command } from "commander";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join, dirname, basename } from "path";
import {
  parseSkillMd,
  parseCursorRule,
  serializeSkillMd,
  serializeCursorRule,
} from "../utils/markdown.js";
import { logger } from "../utils/logger.js";

export const convertCommand = new Command("convert")
  .description("Convert skill between formats")
  .argument("<source>", "Source file path")
  .option("--to <format>", "Target format (skill.md, cursor.mdc)", "skill.md")
  .option("-o, --output <path>", "Output file path")
  .addHelpText(
    "after",
    `
Examples:
  $ osk convert SKILL.md --to cursor.mdc    # Convert to Cursor format
  $ osk convert rule.mdc --to skill.md      # Convert to SKILL.md
  $ osk convert SKILL.md -o ./out.mdc       # Specify output path
`
  )
  .action(async (source: string, options) => {
    if (!existsSync(source)) {
      logger.error(`File not found: ${source}`);
      process.exit(1);
    }

    const content = readFileSync(source, "utf-8");
    // Check if source is Cursor format: .mdc files OR .md files in .cursor directory
    const sourceIsCursor =
      source.endsWith(".mdc") || (source.endsWith(".md") && source.includes(".cursor"));
    const targetFormat = options.to.toLowerCase();

    let output: string;
    let outputPath: string;

    try {
      if (sourceIsCursor && targetFormat === "skill.md") {
        // Convert Cursor .mdc to SKILL.md
        output = cursorToSkill(content, basename(source).replace(/\.(mdc|md)$/, ""));
        outputPath = options.output || join(dirname(source), "SKILL.md");
      } else if (!sourceIsCursor && targetFormat === "cursor.mdc") {
        // Convert SKILL.md to Cursor .mdc
        output = skillToCursor(content);
        const parsed = parseSkillMd(content);
        outputPath = options.output || join(dirname(source), `${parsed.frontmatter.name}.mdc`);
      } else if (sourceIsCursor && targetFormat === "cursor.mdc") {
        logger.info("Source is already in Cursor format");
        return;
      } else if (!sourceIsCursor && targetFormat === "skill.md") {
        logger.info("Source is already in SKILL.md format");
        return;
      } else {
        logger.error(`Invalid target format: ${targetFormat}`);
        logger.dim("Available formats: skill.md, cursor.mdc");
        process.exit(1);
      }
    } catch (err) {
      logger.error(
        `Failed to parse ${source}: ${err instanceof Error ? err.message : String(err)}`
      );
      logger.dim("Ensure the file has valid frontmatter and content");
      process.exit(1);
    }

    writeFileSync(outputPath, output, "utf-8");
    logger.success(`Converted to ${outputPath}`);
  });

function cursorToSkill(content: string, defaultName: string): string {
  const parsed = parseCursorRule(content);

  const frontmatter = {
    name: defaultName,
    description: parsed.frontmatter.description || "Converted from Cursor rule",
    metadata: {
      "converted-from": "cursor",
    },
  };

  return serializeSkillMd({
    frontmatter,
    content: parsed.content,
    raw: "",
  });
}

function skillToCursor(content: string): string {
  const parsed = parseSkillMd(content);

  const frontmatter: Record<string, unknown> = {
    description: parsed.frontmatter.description,
    alwaysApply: false,
  };

  return serializeCursorRule({
    frontmatter,
    content: parsed.content,
    raw: "",
  });
}
