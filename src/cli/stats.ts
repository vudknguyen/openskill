import { Command } from "commander";
import { loadManifest } from "../core/manifest.js";
import { getAllAgents } from "../agents/index.js";
import { logger } from "../utils/logger.js";

export const statsCommand = new Command("stats")
  .description("Show skill installation statistics")
  .addHelpText(
    "after",
    `
Examples:
  $ osk stats     # Show install stats from manifest
`
  )
  .action(async () => {
    const manifest = loadManifest();
    const records = manifest.skills;

    if (records.length === 0) {
      logger.info("No skills installed yet.");
      logger.dim("Install skills with: osk install <source>");
      return;
    }

    logger.header("Skill Statistics");
    logger.newline();

    // By source
    const marketplace = records.filter((s) => s.source === "marketplace");
    const git = records.filter((s) => s.source !== "marketplace");
    logger.log(`  Total installed: ${records.length}`);
    logger.dim(`    Git: ${git.length}  |  Marketplace: ${marketplace.length}`);
    logger.newline();

    // By agent
    logger.log("  By agent:");
    const agentCounts = new Map<string, number>();
    for (const record of records) {
      agentCounts.set(record.agent, (agentCounts.get(record.agent) || 0) + 1);
    }
    const agents = getAllAgents();
    for (const agent of agents) {
      const count = agentCounts.get(agent.name);
      if (count) {
        logger.log(`    ${agent.icon} ${agent.displayName}: ${count} skill(s)`);
      }
    }
    logger.newline();

    // By scope
    const project = records.filter((s) => (s.scope ?? "project") === "project");
    const global = records.filter((s) => s.scope === "global");
    logger.log("  By scope:");
    logger.dim(`    Project: ${project.length}  |  Global: ${global.length}`);
    logger.newline();

    // Recently installed
    const sorted = [...records].sort(
      (a, b) => new Date(b.installedAt).getTime() - new Date(a.installedAt).getTime()
    );
    const recent = sorted.slice(0, 5);
    logger.log("  Recently installed:");
    for (const skill of recent) {
      const date = new Date(skill.installedAt).toLocaleDateString();
      const source = skill.source === "marketplace" ? "marketplace" : `${skill.repoOwner}/${skill.repoName}`;
      logger.dim(`    ${skill.name} (${skill.agent}) — ${date} from ${source}`);
    }
  });
