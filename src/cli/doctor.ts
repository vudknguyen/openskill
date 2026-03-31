import { Command } from "commander";
import { existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { getAllAgents } from "../agents/index.js";
import { loadConfig, getConfigDir } from "../core/config.js";
import { loadAuth } from "../core/auth.js";
import { loadManifest } from "../core/manifest.js";
import { logger } from "../utils/logger.js";

export const doctorCommand = new Command("doctor")
  .description("Diagnose agent configuration and system health")
  .addHelpText(
    "after",
    `
Examples:
  $ osk doctor           # Check all agents and config
`
  )
  .action(async () => {
    let issues = 0;
    let ok = 0;

    logger.header("OpenSkill Doctor");
    logger.newline();

    // 1. Config
    logger.log("  Configuration");
    const configDir = getConfigDir();
    if (existsSync(configDir)) {
      check(`Config directory exists (${configDir})`);
      ok++;
    } else {
      warn("Config directory missing — run any osk command to create it");
      issues++;
    }

    const config = loadConfig();
    logger.dim(`    Default agent: ${config.defaultAgent}`);
    logger.dim(`    Server URL: ${config.serverUrl}`);
    logger.dim(`    Telemetry: ${config.telemetryEnabled ? "enabled" : "disabled"}`);
    logger.dim(`    Repositories: ${config.repos.length} configured`);
    logger.newline();

    // 2. Auth
    logger.log("  Authentication");
    const auth = loadAuth();
    if (auth) {
      check(`Logged in as ${auth.user?.name ?? auth.user?.email ?? "unknown"}`);
      logger.dim(`    Server: ${auth.serverUrl}`);
      if (auth.expiresAt) {
        const expired = new Date(auth.expiresAt) < new Date();
        if (expired) {
          logger.dim("    Access token expired (will auto-refresh on next command)");
        } else {
          logger.dim(`    Token expires: ${auth.expiresAt}`);
        }
      }
      ok++;
    } else {
      warn("Not logged in — run 'osk login' to authenticate");
      issues++;
    }
    logger.newline();

    // 3. Agents
    logger.log("  Agents");
    const agents = getAllAgents();
    for (const agent of agents) {
      const projectPath = agent.getSkillPath();
      const globalPath = agent.getGlobalSkillPath();
      const projectExists = existsSync(projectPath);
      const globalExists = existsSync(globalPath);

      if (projectExists || globalExists) {
        const skills = await agent.listSkills();
        const globalSkills = await agent.listSkills(undefined, "global");
        const total = skills.length + globalSkills.length;
        check(`${agent.displayName}: ${total} skill(s)`);
        if (projectExists) logger.dim(`    Project: ${projectPath} (${skills.length} skills)`);
        if (globalExists) logger.dim(`    Global: ${globalPath} (${globalSkills.length} skills)`);
        ok++;
      } else {
        logger.dim(`    ${agent.icon} ${agent.displayName}: no skills directory found`);
      }
    }
    logger.newline();

    // 4. Manifest
    logger.log("  Manifest");
    const manifest = loadManifest();
    const records = manifest.skills || [];
    const marketplaceSkills = records.filter((s: { source?: string }) => s.source === "marketplace");
    const gitSkills = records.filter((s: { source?: string }) => s.source !== "marketplace");
    check(`${records.length} skill(s) tracked (${gitSkills.length} git, ${marketplaceSkills.length} marketplace)`);
    ok++;
    logger.newline();

    // 5. Summary
    if (issues === 0) {
      logger.success(`All checks passed (${ok} ok)`);
    } else {
      logger.warn(`${issues} issue(s) found, ${ok} ok`);
    }
  });

function check(msg: string): void {
  logger.log(`  \x1b[32m✓\x1b[0m ${msg}`);
}

function warn(msg: string): void {
  logger.log(`  \x1b[33m⚠\x1b[0m ${msg}`);
}
