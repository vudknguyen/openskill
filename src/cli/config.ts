import { Command } from "commander";
import { loadConfig, saveConfig, getConfigPath, addRepo, removeRepo } from "../core/config.js";
import { getAgentNames } from "../agents/index.js";
import { logger } from "../utils/logger.js";

export const configCommand = new Command("config")
  .description("Manage configuration")
  .addHelpText(
    "after",
    `
Examples:
  $ osk config                          # Show current config
  $ osk config get defaultAgent         # Get a value
  $ osk config set defaultAgent cursor  # Set a value
  $ osk config path                     # Show config file path
  $ osk config add-repo name url        # Add a repository
  $ osk config rm-repo name             # Remove a repository
`
  )
  .action(() => {
    // Show current config
    const config = loadConfig();
    logger.header("Configuration");
    logger.log(`  Default agent: ${config.defaultAgent}`);
    logger.log(`  Default scope: ${config.defaultScope || "project"}`);
    logger.newline();
    logger.log("  Repositories:");
    for (const repo of config.repos) {
      logger.log(`    ${repo.name}: ${repo.url}`);
    }
    logger.newline();
    logger.log("  Agent paths:");
    for (const [name, agentConfig] of Object.entries(config.agents)) {
      logger.log(`    ${name}: ${agentConfig.skillPath}`);
    }
    logger.newline();
    logger.dim(`  Config file: ${getConfigPath()}`);
  });

// Subcommand: get
configCommand
  .command("get <key>")
  .description("Get a configuration value")
  .action((key: string) => {
    const config = loadConfig();

    switch (key) {
      case "defaultAgent":
        logger.log(config.defaultAgent);
        break;
      case "defaultScope":
        logger.log(config.defaultScope || "project");
        break;
      case "repos":
        for (const repo of config.repos) {
          logger.log(`${repo.name}: ${repo.url}`);
        }
        break;
      default:
        if (key.startsWith("agents.")) {
          const agentName = key.replace("agents.", "");
          const agentConfig = config.agents[agentName];
          if (agentConfig) {
            logger.log(agentConfig.skillPath);
          } else {
            logger.error(`Invalid agent: ${agentName}`);
            process.exit(1);
          }
        } else {
          logger.error(`Invalid config key: ${key}`);
          logger.dim("Available keys: defaultAgent, defaultScope, repos, agents.<name>");
          process.exit(1);
        }
    }
  });

// Subcommand: set
configCommand
  .command("set <key> <value>")
  .description("Set a configuration value")
  .action((key: string, value: string) => {
    const config = loadConfig();
    const agentNames = getAgentNames();

    switch (key) {
      case "defaultAgent":
        if (!agentNames.includes(value)) {
          logger.error(`Invalid agent: ${value}`);
          logger.dim(`Available agents: ${agentNames.join(", ")}`);
          process.exit(1);
        }
        config.defaultAgent = value;
        saveConfig(config);
        logger.success(`Set defaultAgent to ${value}`);
        break;
      case "defaultScope":
        if (value !== "project" && value !== "global") {
          logger.error(`Invalid scope: ${value}`);
          logger.dim("Available scopes: project, global");
          process.exit(1);
        }
        config.defaultScope = value;
        saveConfig(config);
        logger.success(`Set defaultScope to ${value}`);
        break;
      default:
        if (key.startsWith("agents.") && key.endsWith(".skillPath")) {
          const agentName = key.replace("agents.", "").replace(".skillPath", "");
          if (!config.agents[agentName]) {
            config.agents[agentName] = { skillPath: value };
          } else {
            config.agents[agentName].skillPath = value;
          }
          saveConfig(config);
          logger.success(`Set ${key} to ${value}`);
        } else {
          logger.error(`Invalid or read-only config key: ${key}`);
          logger.dim("Writable keys: defaultAgent, defaultScope, agents.<name>.skillPath");
          process.exit(1);
        }
    }
  });

// Subcommand: path
configCommand
  .command("path")
  .description("Show config file path")
  .action(() => {
    logger.log(getConfigPath());
  });

// Subcommand: add-repo
configCommand
  .command("add-repo <name> <url>")
  .description("Add a skill repository")
  .action((name: string, url: string) => {
    try {
      addRepo(name, url);
      logger.success(`Added repository: ${name}`);
    } catch (err) {
      logger.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

// Subcommand: rm-repo
configCommand
  .command("rm-repo <name>")
  .description("Remove a skill repository")
  .action((name: string) => {
    const removed = removeRepo(name);
    if (removed) {
      logger.success(`Removed repository: ${name}`);
    } else {
      logger.error(`Repository not found: ${name}`);
      process.exit(1);
    }
  });
