import { ParsedSkill, ParsedCursorRule } from "../utils/markdown.js";

export type SkillFormat = "skill.md" | "cursor.mdc";

export interface InstalledSkill {
  name: string;
  description: string;
  path: string;
  version?: string;
  source?: string;
}

export type InstallScope = "project" | "global";

export interface Agent {
  /** Unique identifier for this agent */
  readonly name: string;

  /** Human-readable display name */
  readonly displayName: string;

  /** Icon for display in listings */
  readonly icon: string;

  /** Color code for display */
  readonly color: string;

  /** Skill format this agent uses */
  readonly format: SkillFormat;

  /** Get the project-level skill path */
  getSkillPath(projectDir?: string): string;

  /** Get the global skill path (~/.agent/skills/) */
  getGlobalSkillPath(): string;

  /** List all installed skills */
  listSkills(projectDir?: string, scope?: InstallScope): Promise<InstalledSkill[]>;

  /** Install a skill from parsed SKILL.md (may need conversion) */
  installSkill(
    skill: ParsedSkill,
    skillDir: string,
    projectDir?: string,
    scope?: InstallScope
  ): Promise<void>;

  /** Uninstall a skill by name */
  uninstallSkill(name: string, projectDir?: string, scope?: InstallScope): Promise<boolean>;

  /** Validate if a skill is compatible with this agent */
  validateSkill(skill: ParsedSkill): { valid: boolean; errors: string[] };
}

export interface ConversionResult {
  success: boolean;
  output?: string;
  errors?: string[];
}

export interface Converter {
  /** Source format */
  readonly from: SkillFormat;

  /** Target format */
  readonly to: SkillFormat;

  /** Convert skill content */
  convert(source: ParsedSkill | ParsedCursorRule): ConversionResult;
}
