import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { isValidConfigRepoName, isValidGitUrl } from "../utils/fs.js";
import { InstallScope } from "../agents/types.js";

/**
 * Config version for migration support.
 * Increment when config schema changes.
 */
export const CONFIG_VERSION = 3;

export interface RepoConfig {
  name: string;
  url: string;
}

export interface AgentConfig {
  skillPath: string;
}

// Re-export InstallScope for consumers that import from config
export type { InstallScope };

export interface Config {
  version: number;
  defaultAgent: string;
  defaultScope: InstallScope;
  defaultOrg?: string;
  serverUrl: string;
  telemetryEnabled: boolean;
  repos: RepoConfig[];
  agents: Record<string, AgentConfig>;
}

const DEFAULT_CONFIG: Config = {
  version: CONFIG_VERSION,
  defaultAgent: "claude",
  defaultScope: "project",
  serverUrl: "http://localhost:3000",
  telemetryEnabled: true,
  repos: [
    { name: "anthropic-official", url: "https://github.com/anthropics/skills" },
    { name: "openai-official", url: "https://github.com/openai/skills" },
    { name: "vercel", url: "https://github.com/vercel-labs/agent-skills" },
    { name: "vercel-next", url: "https://github.com/vercel-labs/next-skills" },
    { name: "cloudflare", url: "https://github.com/cloudflare/skills" },
    { name: "supabase", url: "https://github.com/supabase/agent-skills" },
    { name: "google-stitch", url: "https://github.com/google-labs-code/stitch-skills" },
    { name: "huggingface", url: "https://github.com/huggingface/skills" },
    { name: "stripe", url: "https://github.com/stripe/ai" },
    { name: "trailofbits", url: "https://github.com/trailofbits/skills" },
    { name: "expo", url: "https://github.com/expo/skills" },
    { name: "sentry", url: "https://github.com/getsentry/skills" },
    { name: "better-auth", url: "https://github.com/better-auth/skills" },
    { name: "tinybird", url: "https://github.com/tinybirdco/tinybird-agent-skills" },
    { name: "neon", url: "https://github.com/neondatabase/agent-skills" },
    { name: "dmmulroy-cloudflare", url: "https://github.com/dmmulroy/cloudflare-skill" },
  ],
  agents: {
    claude: { skillPath: ".claude/skills" },
    antigravity: { skillPath: ".agent/skills" },
    codex: { skillPath: ".codex/skills" },
    cursor: { skillPath: ".cursor/skills" },
    gemini: { skillPath: ".gemini/skills" },
    copilot: { skillPath: ".github/skills" },
    opencode: { skillPath: ".opencode/skills" },
    windsurf: { skillPath: ".windsurf/skills" },
  },
};

export function getConfigDir(): string {
  return join(homedir(), ".openskill");
}

export function getConfigPath(): string {
  return join(getConfigDir(), "config.json");
}

export function getSkillsCacheDir(): string {
  return join(getConfigDir(), "skills");
}

export function getReposCacheDir(): string {
  return join(getConfigDir(), "repos");
}

export function ensureConfigDir(): void {
  const configDir = getConfigDir();
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }

  const skillsDir = getSkillsCacheDir();
  if (!existsSync(skillsDir)) {
    mkdirSync(skillsDir, { recursive: true });
  }

  const reposDir = getReposCacheDir();
  if (!existsSync(reposDir)) {
    mkdirSync(reposDir, { recursive: true });
  }
}

export function loadConfig(): Config {
  ensureConfigDir();
  const configPath = getConfigPath();

  if (!existsSync(configPath)) {
    saveConfig(DEFAULT_CONFIG);
    return DEFAULT_CONFIG;
  }

  let rawConfig: Record<string, unknown>;
  try {
    const content = readFileSync(configPath, "utf-8");
    rawConfig = JSON.parse(content) as Record<string, unknown>;
  } catch {
    // Corrupted config file, reset to defaults
    saveConfig(DEFAULT_CONFIG);
    return DEFAULT_CONFIG;
  }

  // Validate and migrate old "registries" field to "repos"
  let repos: RepoConfig[] = DEFAULT_CONFIG.repos;
  const rawRepos = rawConfig.repos || rawConfig.registries;
  if (Array.isArray(rawRepos)) {
    repos = rawRepos.filter(
      (r): r is RepoConfig =>
        typeof r === "object" &&
        r !== null &&
        typeof r.name === "string" &&
        typeof r.url === "string"
    );
  }

  // Validate defaultAgent
  const defaultAgent =
    typeof rawConfig.defaultAgent === "string"
      ? rawConfig.defaultAgent
      : DEFAULT_CONFIG.defaultAgent;

  // Validate defaultScope
  const rawScope = rawConfig.defaultScope;
  const defaultScope: InstallScope =
    rawScope === "project" || rawScope === "global" ? rawScope : DEFAULT_CONFIG.defaultScope;

  // Validate serverUrl
  const serverUrl =
    typeof rawConfig.serverUrl === "string"
      ? rawConfig.serverUrl
      : DEFAULT_CONFIG.serverUrl;

  // Validate telemetryEnabled
  const telemetryEnabled =
    typeof rawConfig.telemetryEnabled === "boolean"
      ? rawConfig.telemetryEnabled
      : DEFAULT_CONFIG.telemetryEnabled;

  // Validate agents
  const agents = { ...DEFAULT_CONFIG.agents };
  if (typeof rawConfig.agents === "object" && rawConfig.agents !== null) {
    const rawAgents = rawConfig.agents as Record<string, unknown>;
    for (const [key, value] of Object.entries(rawAgents)) {
      if (
        typeof value === "object" &&
        value !== null &&
        typeof (value as AgentConfig).skillPath === "string"
      ) {
        agents[key] = value as AgentConfig;
      }
    }
  }

  // Validate version - missing version means pre-versioning config (version 0)
  const version = typeof rawConfig.version === "number" ? rawConfig.version : 0;

  const merged: Config = {
    ...DEFAULT_CONFIG,
    version,
    defaultAgent,
    defaultScope,
    serverUrl,
    telemetryEnabled,
    agents,
    repos,
  };

  let needsSave = false;

  // Run version migrations if needed
  if (merged.version < CONFIG_VERSION) {
    migrateConfig(merged, rawConfig);
    needsSave = true;
  }

  if (needsSave) {
    saveConfig(merged);
  }

  return merged;
}

/**
 * Migrates a config from an older version to the current version.
 * Add version-specific migrations here as the schema evolves.
 * @param config - The config to migrate (mutated in place).
 * @param rawConfig - The raw config data for accessing old field names.
 */
function migrateConfig(config: Config, _rawConfig: Record<string, unknown>): void {
  // Migration from version 0 (pre-versioning) to version 1
  if (config.version < 1) {
    // Migrate old cursor path from .cursor/rules to .cursor/skills
    if (config.agents.cursor?.skillPath === ".cursor/rules") {
      config.agents.cursor.skillPath = ".cursor/skills";
    }

    // Migrate old "registries" field to "repos" (already handled in field parsing above)
    // Just marking the migration as complete

    config.version = 1;
  }

  // Migration from version 1 to version 2: add new agents, update antigravity path
  if (config.version < 2) {
    // Add new agent configs if missing
    const newAgentDefaults: Record<string, AgentConfig> = {
      gemini: { skillPath: ".gemini/skills" },
      copilot: { skillPath: ".github/skills" },
      opencode: { skillPath: ".opencode/skills" },
      windsurf: { skillPath: ".windsurf/skills" },
    };
    for (const [name, defaultCfg] of Object.entries(newAgentDefaults)) {
      if (!config.agents[name]) {
        config.agents[name] = defaultCfg;
      }
    }

    // Migrate antigravity path from .antigravity/skills to .agent/skills
    if (config.agents.antigravity?.skillPath === ".antigravity/skills") {
      config.agents.antigravity.skillPath = ".agent/skills";
    }

    config.version = 2;
  }

  // Migration from version 2 to version 3: add new default skill repos
  if (config.version < 3) {
    const existingUrls = new Set(config.repos.map((r) => r.url));
    for (const repo of DEFAULT_CONFIG.repos) {
      if (!existingUrls.has(repo.url)) {
        config.repos.push(repo);
      }
    }
    config.version = 3;
  }
}

export function saveConfig(config: Config): void {
  ensureConfigDir();
  const configPath = getConfigPath();
  writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
}

export function addRepo(name: string, url: string): void {
  // Validate repo name
  if (!isValidConfigRepoName(name)) {
    throw new Error(
      `Invalid repository name: ${name}. Use only letters, numbers, dashes, and underscores.`
    );
  }

  // Validate URL format - must be a valid Git URL
  if (!isValidGitUrl(url)) {
    throw new Error(
      `Invalid repository URL: ${url}. Supported formats: https://host/owner/repo, git@host:owner/repo, owner/repo`
    );
  }

  const config = loadConfig();
  const existing = config.repos.find((r) => r.name === name);
  if (existing) {
    existing.url = url;
  } else {
    config.repos.push({ name, url });
  }
  saveConfig(config);
}

export function removeRepo(name: string): boolean {
  const config = loadConfig();
  const index = config.repos.findIndex((r) => r.name === name);
  if (index === -1) return false;
  config.repos.splice(index, 1);
  saveConfig(config);
  return true;
}
