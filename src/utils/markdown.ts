import matter from "gray-matter";

export interface SkillFrontmatter {
  name: string;
  description: string;
  license?: string;
  compatibility?: string;
  metadata?: Record<string, string>;
  "allowed-tools"?: string;
}

export interface CursorFrontmatter {
  description?: string;
  alwaysApply?: boolean;
  globs?: string[];
}

export interface ParsedSkill {
  frontmatter: SkillFrontmatter;
  content: string;
  raw: string;
}

export interface ParsedCursorRule {
  frontmatter: CursorFrontmatter;
  content: string;
  raw: string;
}

export function parseSkillMd(source: string): ParsedSkill {
  const { data, content } = matter(source);

  if (!data.name || typeof data.name !== "string") {
    throw new Error("SKILL.md must have a 'name' field in frontmatter");
  }
  if (!data.description || typeof data.description !== "string") {
    throw new Error("SKILL.md must have a 'description' field in frontmatter");
  }

  return {
    frontmatter: data as SkillFrontmatter,
    content: content.trim(),
    raw: source,
  };
}

export function parseCursorRule(source: string): ParsedCursorRule {
  const { data, content } = matter(source);

  return {
    frontmatter: data as CursorFrontmatter,
    content: content.trim(),
    raw: source,
  };
}

export function serializeSkillMd(skill: ParsedSkill): string {
  return matter.stringify(skill.content, skill.frontmatter);
}

export function serializeCursorRule(rule: ParsedCursorRule): string {
  if (Object.keys(rule.frontmatter).length === 0) {
    return rule.content;
  }
  return matter.stringify(rule.content, rule.frontmatter);
}

/**
 * Parses a YAML string into an object.
 * @param source - The YAML string to parse.
 * @returns The parsed object, or null if parsing fails.
 *
 * Used for config file migration (config.yaml → config.json).
 */
export function parseYaml(source: string): Record<string, unknown> | null {
  try {
    // Use gray-matter by wrapping YAML as frontmatter
    const { data } = matter(`---\n${source}\n---`);
    return data as Record<string, unknown>;
  } catch {
    return null;
  }
}
