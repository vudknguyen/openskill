#!/usr/bin/env node

import { Command } from "commander";
import { PromptCancelledError, confirm } from "../utils/prompt.js";
import { loadConfig } from "../core/config.js";
import { refreshAllRepos } from "../core/registry.js";
import { logger, createSpinner } from "../utils/logger.js";
import { installCommand } from "./install.js";
import { uninstallCommand } from "./uninstall.js";
import { listCommand } from "./list.js";
import { updateCommand } from "./update.js";
import { searchCommand } from "./search.js";
import { convertCommand } from "./convert.js";
import { initCommand } from "./init.js";
import { validateCommand } from "./validate.js";
import { manCommand } from "./man.js";
import { whichCommand } from "./which.js";
import { completionCommand } from "./completion.js";
import { configCommand } from "./config.js";
import { repoCommand } from "./repo.js";
import { browseCommand } from "./browse.js";
import { versionCommand, getVersion } from "./version.js";

const program = new Command();

program
  .name("openskill")
  .alias("osk")
  .description("Agent-agnostic skill manager for AI coding assistants")
  .version(getVersion())
  .action(async () => {
    // Default action when no command provided - show welcome/help
    const config = loadConfig();

    logger.header("OpenSkill (osk)");
    logger.log("Agent-agnostic skill manager for AI coding assistants");
    logger.newline();

    // Check if first run (no repos synced yet)
    const hasRepos = config.repos.length > 0;

    if (hasRepos) {
      // Show quick start commands
      logger.log("Common commands:");
      logger.dim("  osk browse           Browse available skills");
      logger.dim("  osk search <query>   Search for skills");
      logger.dim("  osk install <repo>   Install skills from repository");
      logger.dim("  osk list             List installed skills");
      logger.dim("  osk help             Show all commands");
      logger.newline();

      // Offer to sync if repos exist
      const shouldSync = await confirm("Refresh repositories to check for new skills?", false);
      if (shouldSync) {
        const spinner = createSpinner("Refreshing repositories...");
        await refreshAllRepos();
        spinner.stop("Repositories refreshed");
        logger.dim("Run 'osk browse' to see available skills");
      }
    } else {
      logger.log("Getting started:");
      logger.dim("  1. Add a skill repository: osk repo add <owner/repo>");
      logger.dim("  2. Sync repositories: osk repo sync");
      logger.dim("  3. Browse and install: osk browse");
      logger.newline();

      const shouldSync = await confirm("Sync repositories now?", true);
      if (shouldSync) {
        const spinner = createSpinner("Syncing repositories...");
        await refreshAllRepos();
        spinner.stop("Repositories synced");
        logger.newline();
        logger.success("You're all set! Run 'osk browse' to see available skills.");
      } else {
        logger.dim("Run 'osk repo sync' when you're ready to get started.");
      }
    }
  });

program.addCommand(installCommand);
program.addCommand(uninstallCommand);
program.addCommand(listCommand);
program.addCommand(updateCommand);
program.addCommand(searchCommand);
program.addCommand(convertCommand);
program.addCommand(initCommand);
program.addCommand(validateCommand);
program.addCommand(manCommand);
program.addCommand(whichCommand);
program.addCommand(completionCommand);
program.addCommand(configCommand);
program.addCommand(repoCommand);
program.addCommand(browseCommand);
program.addCommand(versionCommand);

// Handle unhandled rejections (including PromptCancelledError)
process.on("unhandledRejection", (reason) => {
  if (reason instanceof PromptCancelledError) {
    process.exit(0);
  }
  logger.rawError(reason);
  process.exit(1);
});

program.parseAsync().catch((err) => {
  if (err instanceof PromptCancelledError) {
    process.exit(0);
  }
  logger.error(err.message);
  process.exit(1);
});
