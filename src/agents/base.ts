import { existsSync, cpSync, rmSync, readFileSync, lstatSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { Agent, InstalledSkill, InstallScope, SkillFormat } from "./types.js";
import { loadConfig } from "../core/config.js";
import { ParsedSkill, parseSkillMd } from "../utils/markdown.js";
import { ensureDir, findSkillDirs, getProjectRoot, safeJoinPath } from "../utils/fs.js";
import { validateSkillName, validateSkillDescription } from "../core/skill.js";

export interface AgentConfig {
  name: string;
  displayName: string;
  icon: string;
  color: string;
  defaultSkillPath: string;
  globalDirName: string;
}

/**
 * Base implementation for agents that use the SKILL.md format.
 * All current agents (Claude, Cursor, Codex, Antigravity) share identical
 * implementation logic, differing only in configuration.
 */
export class BaseAgent implements Agent {
  readonly name: string;
  readonly displayName: string;
  readonly icon: string;
  readonly color: string;
  readonly format: SkillFormat = "skill.md";

  private readonly defaultSkillPath: string;
  private readonly globalDirName: string;

  constructor(config: AgentConfig) {
    this.name = config.name;
    this.displayName = config.displayName;
    this.icon = config.icon;
    this.color = config.color;
    this.defaultSkillPath = config.defaultSkillPath;
    this.globalDirName = config.globalDirName;
  }

  getSkillPath(projectDir?: string): string {
    const config = loadConfig();
    const base = projectDir || getProjectRoot();
    return join(base, config.agents[this.name]?.skillPath || this.defaultSkillPath);
  }

  getGlobalSkillPath(): string {
    return join(homedir(), this.globalDirName, "skills");
  }

  private getTargetPath(projectDir?: string, scope: InstallScope = "project"): string {
    return scope === "global" ? this.getGlobalSkillPath() : this.getSkillPath(projectDir);
  }

  async listSkills(projectDir?: string, scope?: InstallScope): Promise<InstalledSkill[]> {
    const skills: InstalledSkill[] = [];
    const paths: Array<{ path: string; isGlobal: boolean }> = [];

    if (!scope || scope === "project") {
      paths.push({ path: this.getSkillPath(projectDir), isGlobal: false });
    }
    if (!scope || scope === "global") {
      paths.push({ path: this.getGlobalSkillPath(), isGlobal: true });
    }

    for (const { path: skillPath, isGlobal } of paths) {
      const skillDirs = findSkillDirs(skillPath);

      for (const dir of skillDirs) {
        const skillMdPath = join(dir, "SKILL.md");
        if (existsSync(skillMdPath)) {
          try {
            const content = readFileSync(skillMdPath, "utf-8");
            const parsed = parseSkillMd(content);
            skills.push({
              name: parsed.frontmatter.name,
              description: parsed.frontmatter.description,
              path: dir,
              version: parsed.frontmatter.metadata?.version,
              source: isGlobal ? "global" : "project",
            });
          } catch {
            // Skip invalid skills
          }
        }
      }
    }

    return skills;
  }

  async installSkill(
    skill: ParsedSkill,
    skillDir: string,
    projectDir?: string,
    scope: InstallScope = "project"
  ): Promise<void> {
    // Validate skillDir is not a symlink to prevent symlink attacks
    try {
      const stats = lstatSync(skillDir);
      if (stats.isSymbolicLink()) {
        throw new Error(`Skill directory cannot be a symlink: ${skillDir}`);
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        throw new Error(`Skill directory not found: ${skillDir}`);
      }
      throw err;
    }

    const targetPath = this.getTargetPath(projectDir, scope);
    ensureDir(targetPath);

    const skillTargetDir = safeJoinPath(targetPath, skill.frontmatter.name);
    if (!skillTargetDir) {
      throw new Error(`Invalid skill name: ${skill.frontmatter.name}`);
    }

    // Remove existing skill directory (force: true handles non-existent paths)
    rmSync(skillTargetDir, { recursive: true, force: true });

    // Copy skill, dereferencing symlinks to prevent symlink attacks
    cpSync(skillDir, skillTargetDir, { recursive: true, dereference: true });
  }

  async uninstallSkill(
    name: string,
    projectDir?: string,
    scope: InstallScope = "project"
  ): Promise<boolean> {
    const targetPath = this.getTargetPath(projectDir, scope);
    const skillDir = safeJoinPath(targetPath, name);

    if (!skillDir || !existsSync(skillDir)) {
      return false;
    }

    rmSync(skillDir, { recursive: true, force: true });
    return true;
  }

  validateSkill(skill: ParsedSkill): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    const nameValidation = validateSkillName(skill.frontmatter.name);
    if (!nameValidation.valid) {
      errors.push(`name: ${nameValidation.error}`);
    }

    const descValidation = validateSkillDescription(skill.frontmatter.description);
    if (!descValidation.valid) {
      errors.push(`description: ${descValidation.error}`);
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}
