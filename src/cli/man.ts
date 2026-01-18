import { Command } from "commander";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { getAllInstalledSkills } from "../core/manifest.js";
import { getAgent } from "../agents/index.js";
import { parseSkillMd, parseCursorRule } from "../utils/markdown.js";
import { logger } from "../utils/logger.js";

const colors = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
};

const manPages: Record<string, string> = {
  osk: `
${colors.bold}NAME${colors.reset}
    osk - Agent-agnostic skill manager for AI coding assistants

${colors.bold}SYNOPSIS${colors.reset}
    ${colors.cyan}osk${colors.reset} <command> [arguments] [options]

${colors.bold}DESCRIPTION${colors.reset}
    OpenSkill (osk) manages skills across multiple AI coding agents including
    Claude Code, Antigravity, OpenAI Codex, and Cursor. Skills are packages of
    instructions that extend agent capabilities.

${colors.bold}COMMANDS${colors.reset}
    ${colors.cyan}install${colors.reset}, ${colors.cyan}i${colors.reset}      Install skills from a repository
    ${colors.cyan}uninstall${colors.reset}, ${colors.cyan}rm${colors.reset}   Remove installed skills
    ${colors.cyan}list${colors.reset}, ${colors.cyan}ls${colors.reset}        List installed skills or show skill details
    ${colors.cyan}update${colors.reset}, ${colors.cyan}up${colors.reset}      Check and apply skill updates
    ${colors.cyan}search${colors.reset}, ${colors.cyan}s${colors.reset}       Search for skills in repositories
    ${colors.cyan}browse${colors.reset}, ${colors.cyan}b${colors.reset}       Browse available skills
    ${colors.cyan}repo${colors.reset}           Manage skill repositories
    ${colors.cyan}convert${colors.reset}        Convert skills between formats
    ${colors.cyan}init${colors.reset}           Create a new skill
    ${colors.cyan}validate${colors.reset}       Validate skill format
    ${colors.cyan}man${colors.reset}            Show detailed help for commands
    ${colors.cyan}which${colors.reset}          Show installation path for a skill
    ${colors.cyan}config${colors.reset}         Manage configuration
    ${colors.cyan}completion${colors.reset}     Generate shell completion script

${colors.bold}AGENTS${colors.reset}
    ${colors.yellow}claude${colors.reset}         Claude Code (.claude/skills/)
    ${colors.yellow}antigravity${colors.reset}    Antigravity (.antigravity/skills/)
    ${colors.yellow}codex${colors.reset}          OpenAI Codex (.codex/skills/)
    ${colors.yellow}cursor${colors.reset}         Cursor (.cursor/skills/)

${colors.bold}EXAMPLES${colors.reset}
    ${colors.dim}# Install skills interactively${colors.reset}
    osk install anthropics/skills

    ${colors.dim}# Install specific skill to specific agent${colors.reset}
    osk install anthropics/skills pdf -t claude

    ${colors.dim}# List all installed skills${colors.reset}
    osk ls

    ${colors.dim}# Show skill details${colors.reset}
    osk ls pdf

    ${colors.dim}# Check for updates${colors.reset}
    osk update --check

    ${colors.dim}# Search for skills${colors.reset}
    osk search pdf

${colors.bold}FILES${colors.reset}
    ~/.openskill/config.json    Global configuration
    ~/.openskill/skills/        Cached skill repositories
    ~/.openskill/manifest.json  Installed skills tracking

${colors.bold}SEE ALSO${colors.reset}
    osk man install, osk man list, osk man skill
`,

  install: `
${colors.bold}NAME${colors.reset}
    osk install - Install skills from a repository

${colors.bold}SYNOPSIS${colors.reset}
    ${colors.cyan}osk install${colors.reset} <source> [skill] [options]

${colors.bold}DESCRIPTION${colors.reset}
    Install skills from Git repositories. Supports GitHub, GitLab, and
    self-hosted Git servers. Interactive selection of skills and agents.

${colors.bold}ARGUMENTS${colors.reset}
    ${colors.yellow}<source>${colors.reset}
        Repository URL, ${colors.dim}owner/repo${colors.reset} shorthand, or skill name to search

    ${colors.yellow}[skill]${colors.reset}
        Specific skill name to install from the repository

${colors.bold}OPTIONS${colors.reset}
    ${colors.cyan}-t, --target <agent>${colors.reset}
        Target agent: claude, antigravity, codex, cursor

    ${colors.cyan}-a, --all${colors.reset}
        Install all skills from repository (requires -t/--target)

    ${colors.cyan}-g, --global${colors.reset}
        Install to global directory (~/.{agent}/skills/)
        Default: project directory (.{agent}/skills/)

    ${colors.cyan}-y, --yes${colors.reset}
        Skip interactive prompts, use defaults

${colors.bold}EXAMPLES${colors.reset}
    ${colors.dim}# Interactive install${colors.reset}
    osk install anthropics/skills

    ${colors.dim}# Install from GitLab${colors.reset}
    osk install https://gitlab.com/user/repo

    ${colors.dim}# Install via SSH${colors.reset}
    osk install git@github.com:user/repo.git

    ${colors.dim}# Install specific skill${colors.reset}
    osk install anthropics/skills pdf

    ${colors.dim}# Install to specific agent${colors.reset}
    osk install anthropics/skills -t claude

    ${colors.dim}# Install all skills to Cursor${colors.reset}
    osk install anthropics/skills -a -t cursor

    ${colors.dim}# Install to global directory${colors.reset}
    osk install anthropics/skills pdf -g

    ${colors.dim}# Search and install by name${colors.reset}
    osk install pdf
`,

  update: `
${colors.bold}NAME${colors.reset}
    osk update - Check and apply skill updates

${colors.bold}SYNOPSIS${colors.reset}
    ${colors.cyan}osk update${colors.reset} [options]

${colors.bold}DESCRIPTION${colors.reset}
    Check installed skills for updates by comparing local commit hashes
    with remote repositories. Optionally apply selected updates.

${colors.bold}OPTIONS${colors.reset}
    ${colors.cyan}--check${colors.reset}
        Only check for updates, don't install

    ${colors.cyan}--repos${colors.reset}
        Only update repository caches (not installed skills)

${colors.bold}EXAMPLES${colors.reset}
    ${colors.dim}# Check for updates${colors.reset}
    osk update --check

    ${colors.dim}# Interactive update${colors.reset}
    osk update

    ${colors.dim}# Update repository cache${colors.reset}
    osk update --repos
`,

  list: `
${colors.bold}NAME${colors.reset}
    osk list - List installed skills

${colors.bold}SYNOPSIS${colors.reset}
    ${colors.cyan}osk ls${colors.reset} [options]
    ${colors.cyan}osk ls${colors.reset} [options] <agent>
    ${colors.cyan}osk ls${colors.reset} [options] <skill>

${colors.bold}ARGUMENTS${colors.reset}
    ${colors.yellow}<agent>${colors.reset}
        Agent name: claude, antigravity, codex, cursor
        Shows all skills installed for that agent

    ${colors.yellow}<skill>${colors.reset}
        Skill name to show detailed information
        Displays version, source, install date, and path

${colors.bold}OPTIONS${colors.reset}
    ${colors.cyan}-g, --global${colors.reset}
        List only global skills (~/.{agent}/skills/)

    ${colors.cyan}--all${colors.reset}
        List both project and global skills

${colors.bold}EXAMPLES${colors.reset}
    ${colors.dim}# List project skills (default)${colors.reset}
    osk ls

    ${colors.dim}# List global skills${colors.reset}
    osk ls -g

    ${colors.dim}# List both project and global${colors.reset}
    osk ls --all

    ${colors.dim}# List Claude skills only${colors.reset}
    osk ls claude

    ${colors.dim}# Show detailed info for a skill${colors.reset}
    osk ls pdf
`,

  search: `
${colors.bold}NAME${colors.reset}
    osk search - Search for skills in repositories

${colors.bold}SYNOPSIS${colors.reset}
    ${colors.cyan}osk search${colors.reset} <query> [options]

${colors.bold}DESCRIPTION${colors.reset}
    Search for skills across all configured repositories or within a
    specific repository. Matches against skill names and descriptions.

${colors.bold}OPTIONS${colors.reset}
    ${colors.cyan}-i, --install${colors.reset}
        Enter interactive install mode after search.
        Allows selecting skills to install with searchable multi-select.

    ${colors.cyan}-r, --repo <name>${colors.reset}
        Search in specific repository only

    ${colors.cyan}--refresh${colors.reset}
        Refresh repositories before searching

${colors.bold}EXAMPLES${colors.reset}
    ${colors.dim}# Search all repositories${colors.reset}
    osk search pdf

    ${colors.dim}# Search and install interactively${colors.reset}
    osk search pdf -i

    ${colors.dim}# Search specific repository${colors.reset}
    osk search pdf --repo anthropic-official

    ${colors.dim}# Refresh and search${colors.reset}
    osk search pdf --refresh
`,

  uninstall: `
${colors.bold}NAME${colors.reset}
    osk uninstall - Remove installed skills

${colors.bold}SYNOPSIS${colors.reset}
    ${colors.cyan}osk uninstall${colors.reset} [options] <skill>
    ${colors.cyan}osk uninstall${colors.reset} [options] <agent> <skill>

${colors.bold}ARGUMENTS${colors.reset}
    ${colors.yellow}<skill>${colors.reset}
        Skill name to uninstall

    ${colors.yellow}<agent>${colors.reset}
        Target agent: claude, antigravity, codex, cursor

${colors.bold}OPTIONS${colors.reset}
    ${colors.cyan}-a, --all${colors.reset}
        Remove from all agents

    ${colors.cyan}-g, --global${colors.reset}
        Remove from global directory

    ${colors.cyan}-y, --yes${colors.reset}
        Skip confirmation prompt

${colors.bold}EXAMPLES${colors.reset}
    ${colors.dim}# Remove from project (default)${colors.reset}
    osk uninstall pdf

    ${colors.dim}# Remove from global directory${colors.reset}
    osk uninstall pdf -g

    ${colors.dim}# Remove from specific agent${colors.reset}
    osk uninstall claude pdf

    ${colors.dim}# Remove from all agents${colors.reset}
    osk uninstall pdf -a
`,

  init: `
${colors.bold}NAME${colors.reset}
    osk init - Create a new skill

${colors.bold}SYNOPSIS${colors.reset}
    ${colors.cyan}osk init${colors.reset} [name] [options]

${colors.bold}OPTIONS${colors.reset}
    ${colors.cyan}-d, --dir <path>${colors.reset}
        Directory to create skill in (default: current)

${colors.bold}EXAMPLES${colors.reset}
    ${colors.dim}# Interactive creation${colors.reset}
    osk init

    ${colors.dim}# Create with name${colors.reset}
    osk init my-skill
`,

  convert: `
${colors.bold}NAME${colors.reset}
    osk convert - Convert skills between formats

${colors.bold}SYNOPSIS${colors.reset}
    ${colors.cyan}osk convert${colors.reset} <source> [options]

${colors.bold}DESCRIPTION${colors.reset}
    Convert between Agent Skills format (SKILL.md) and legacy Cursor .mdc format.
    Note: Cursor now uses SKILL.md format natively, so conversion is mainly for
    migrating old .mdc rules to the new format.

${colors.bold}ARGUMENTS${colors.reset}
    ${colors.yellow}<source>${colors.reset}
        Source file path (SKILL.md or .mdc file)

${colors.bold}OPTIONS${colors.reset}
    ${colors.cyan}--to <format>${colors.reset}
        Target format: skill.md, cursor.mdc (default: skill.md)

    ${colors.cyan}-o, --output <path>${colors.reset}
        Output file path (default: same directory as source)

${colors.bold}EXAMPLES${colors.reset}
    ${colors.dim}# Convert legacy .mdc rule to SKILL.md${colors.reset}
    osk convert my-rule.mdc --to skill.md

    ${colors.dim}# Convert SKILL.md to legacy .mdc format${colors.reset}
    osk convert SKILL.md --to cursor.mdc

    ${colors.dim}# Specify output path${colors.reset}
    osk convert my-rule.mdc -o ./skills/my-skill/SKILL.md
`,

  validate: `
${colors.bold}NAME${colors.reset}
    osk validate - Validate skill format

${colors.bold}SYNOPSIS${colors.reset}
    ${colors.cyan}osk validate${colors.reset} [path] [options]

${colors.bold}DESCRIPTION${colors.reset}
    Validate SKILL.md files for correct format, required fields, and
    best practices. Can validate a single skill or directory of skills.

${colors.bold}ARGUMENTS${colors.reset}
    ${colors.yellow}[path]${colors.reset}
        Path to skill directory or SKILL.md file (default: current directory)

${colors.bold}OPTIONS${colors.reset}
    ${colors.cyan}--strict${colors.reset}
        Enable strict validation (checks license, content length,
        directory name matching)

${colors.bold}VALIDATION CHECKS${colors.reset}
    ${colors.dim}Standard:${colors.reset}
    - Valid YAML frontmatter
    - Required fields: name, description
    - Name format (lowercase, hyphens, no consecutive hyphens)
    - Description length (max 1024 chars)
    - Has instruction content

    ${colors.dim}Strict mode adds:${colors.reset}
    - License field present
    - Name matches directory name
    - Content under 500 lines

${colors.bold}EXAMPLES${colors.reset}
    ${colors.dim}# Validate current directory${colors.reset}
    osk validate

    ${colors.dim}# Validate specific skill${colors.reset}
    osk validate ./skills/my-skill

    ${colors.dim}# Strict validation${colors.reset}
    osk validate ./skills --strict
`,

  man: `
${colors.bold}NAME${colors.reset}
    osk man - Show detailed help for commands and skills

${colors.bold}SYNOPSIS${colors.reset}
    ${colors.cyan}osk man${colors.reset} [topic]

${colors.bold}DESCRIPTION${colors.reset}
    Display detailed manual pages for osk commands or installed skills.
    Without arguments, shows the main osk manual page.

${colors.bold}ARGUMENTS${colors.reset}
    ${colors.yellow}[topic]${colors.reset}
        Command name (install, list, etc.) or installed skill name

${colors.bold}BUILT-IN PAGES${colors.reset}
    osk, install, uninstall, list, update, search, browse, repo,
    convert, init, validate, man, which, config, completion, skill

${colors.bold}EXAMPLES${colors.reset}
    ${colors.dim}# Show main manual${colors.reset}
    osk man

    ${colors.dim}# Show install command help${colors.reset}
    osk man install

    ${colors.dim}# Show skill format specification${colors.reset}
    osk man skill

    ${colors.dim}# Show installed skill documentation${colors.reset}
    osk man pdf
`,

  which: `
${colors.bold}NAME${colors.reset}
    osk which - Show installation path for a skill

${colors.bold}SYNOPSIS${colors.reset}
    ${colors.cyan}osk which${colors.reset} <skill>

${colors.bold}DESCRIPTION${colors.reset}
    Display the full installation path for a skill across all agents
    where it is installed. Similar to Unix 'which' command.

${colors.bold}ARGUMENTS${colors.reset}
    ${colors.yellow}<skill>${colors.reset}
        Name of the skill to locate

${colors.bold}EXAMPLES${colors.reset}
    ${colors.dim}# Find where pdf skill is installed${colors.reset}
    osk which pdf

    ${colors.dim}# Find mcp-builder locations${colors.reset}
    osk which mcp-builder
`,

  config: `
${colors.bold}NAME${colors.reset}
    osk config - Manage configuration

${colors.bold}SYNOPSIS${colors.reset}
    ${colors.cyan}osk config${colors.reset}
    ${colors.cyan}osk config get${colors.reset} <key>
    ${colors.cyan}osk config set${colors.reset} <key> <value>
    ${colors.cyan}osk config path${colors.reset}
    ${colors.cyan}osk config add-repo${colors.reset} <name> <url>
    ${colors.cyan}osk config rm-repo${colors.reset} <name>

${colors.bold}DESCRIPTION${colors.reset}
    View and modify osk configuration. Without arguments, displays
    the current configuration.

${colors.bold}SUBCOMMANDS${colors.reset}
    ${colors.cyan}get${colors.reset} <key>
        Get a configuration value

    ${colors.cyan}set${colors.reset} <key> <value>
        Set a configuration value

    ${colors.cyan}path${colors.reset}
        Show the config file location

    ${colors.cyan}add-repo${colors.reset} <name> <url>
        Add a skill repository

    ${colors.cyan}rm-repo${colors.reset} <name>
        Remove a skill repository

${colors.bold}CONFIG KEYS${colors.reset}
    ${colors.yellow}defaultAgent${colors.reset}
        Default agent for operations (claude, antigravity, codex, cursor)

    ${colors.yellow}defaultScope${colors.reset}
        Default installation scope (project, global)

    ${colors.yellow}agents.<name>.skillPath${colors.reset}
        Custom skill path for an agent

${colors.bold}EXAMPLES${colors.reset}
    ${colors.dim}# Show current config${colors.reset}
    osk config

    ${colors.dim}# Change default agent${colors.reset}
    osk config set defaultAgent cursor

    ${colors.dim}# Change default scope to global${colors.reset}
    osk config set defaultScope global

    ${colors.dim}# Add custom repository${colors.reset}
    osk config add-repo my-skills https://github.com/me/skills
`,

  completion: `
${colors.bold}NAME${colors.reset}
    osk completion - Generate shell completion script

${colors.bold}SYNOPSIS${colors.reset}
    ${colors.cyan}osk completion${colors.reset} [shell]

${colors.bold}DESCRIPTION${colors.reset}
    Generate a shell completion script. Supports bash, zsh, and fish.
    Output can be appended to your shell's rc file.

${colors.bold}ARGUMENTS${colors.reset}
    ${colors.yellow}[shell]${colors.reset}
        Shell type: bash, zsh, fish (default: bash)

${colors.bold}INSTALLATION${colors.reset}
    ${colors.dim}# Bash${colors.reset}
    osk completion bash >> ~/.bashrc

    ${colors.dim}# Zsh${colors.reset}
    osk completion zsh >> ~/.zshrc

    ${colors.dim}# Fish${colors.reset}
    osk completion fish > ~/.config/fish/completions/osk.fish

${colors.bold}EXAMPLES${colors.reset}
    ${colors.dim}# Generate and preview bash completion${colors.reset}
    osk completion bash

    ${colors.dim}# Install zsh completion${colors.reset}
    osk completion zsh >> ~/.zshrc && source ~/.zshrc
`,

  repo: `
${colors.bold}NAME${colors.reset}
    osk repo - Manage skill repositories

${colors.bold}SYNOPSIS${colors.reset}
    ${colors.cyan}osk repo add${colors.reset} <source> [--name <name>]
    ${colors.cyan}osk repo ls${colors.reset}
    ${colors.cyan}osk repo rm${colors.reset} <name>
    ${colors.cyan}osk repo sync${colors.reset} [name]
    ${colors.cyan}osk repo info${colors.reset} <name>

${colors.bold}DESCRIPTION${colors.reset}
    Manage skill repositories for browsing and searching. Supports GitHub,
    GitLab, and self-hosted Git servers.

${colors.bold}SUBCOMMANDS${colors.reset}
    ${colors.cyan}add${colors.reset} <source>
        Add a repository. Source can be owner/repo, HTTPS URL, or SSH URL.
        Automatically syncs after adding.

        ${colors.dim}Options:${colors.reset}
        -n, --name <name>    Custom name for the repository

    ${colors.cyan}ls${colors.reset}, ${colors.cyan}list${colors.reset}
        List all configured repositories with skill counts and sync status.

    ${colors.cyan}rm${colors.reset}, ${colors.cyan}remove${colors.reset} <name>
        Remove a repository from configuration.

    ${colors.cyan}sync${colors.reset} [name]
        Sync repositories to fetch latest skills. Without name argument,
        syncs all repositories.

    ${colors.cyan}info${colors.reset} <name>
        Show detailed information about a repository including
        available skills.

${colors.bold}EXAMPLES${colors.reset}
    ${colors.dim}# Add a repository${colors.reset}
    osk repo add anthropics/skills

    ${colors.dim}# Add a GitLab repository${colors.reset}
    osk repo add https://gitlab.com/user/repo

    ${colors.dim}# Add via SSH${colors.reset}
    osk repo add git@github.com:user/repo.git --name my-skills

    ${colors.dim}# List repositories${colors.reset}
    osk repo ls

    ${colors.dim}# Sync all repositories${colors.reset}
    osk repo sync

    ${colors.dim}# Sync specific repository${colors.reset}
    osk repo sync anthropic-official

    ${colors.dim}# Show repository details${colors.reset}
    osk repo info anthropic-official

    ${colors.dim}# Remove a repository${colors.reset}
    osk repo rm my-skills

${colors.bold}SEE ALSO${colors.reset}
    osk man browse, osk man search
`,

  browse: `
${colors.bold}NAME${colors.reset}
    osk browse - Browse available skills from repositories

${colors.bold}SYNOPSIS${colors.reset}
    ${colors.cyan}osk browse${colors.reset} [repo] [options]

${colors.bold}DESCRIPTION${colors.reset}
    Browse skills available in configured repositories. Shows skills
    grouped by repository with descriptions. Optionally enter interactive
    mode to select and install skills.

${colors.bold}ARGUMENTS${colors.reset}
    ${colors.yellow}[repo]${colors.reset}
        Repository name to browse. If not provided, shows skills from
        all repositories.

${colors.bold}OPTIONS${colors.reset}
    ${colors.cyan}-i, --install${colors.reset}
        Enter interactive install mode. After displaying skills,
        prompts for selection and proceeds directly to installation.

${colors.bold}EXAMPLES${colors.reset}
    ${colors.dim}# Browse all repositories${colors.reset}
    osk browse

    ${colors.dim}# Browse specific repository${colors.reset}
    osk browse anthropic-official

    ${colors.dim}# Browse and install interactively${colors.reset}
    osk browse -i

    ${colors.dim}# Browse specific repo and install${colors.reset}
    osk browse anthropic-official -i

${colors.bold}SEE ALSO${colors.reset}
    osk man repo, osk man search, osk man install
`,

  skill: `
${colors.bold}NAME${colors.reset}
    skill - Agent Skills format specification

${colors.bold}DESCRIPTION${colors.reset}
    A skill is a package of instructions that extends an AI coding agent's
    capabilities. Skills are defined using a SKILL.md file with YAML frontmatter
    and markdown content.

${colors.bold}FILE STRUCTURE${colors.reset}
    skills/
    └── my-skill/
        ├── SKILL.md          ${colors.dim}Required: skill definition${colors.reset}
        └── examples/         ${colors.dim}Optional: example files${colors.reset}

${colors.bold}SKILL.MD FORMAT${colors.reset}
    A SKILL.md file consists of YAML frontmatter and markdown content:

    ${colors.dim}---${colors.reset}
    ${colors.cyan}name${colors.reset}: my-skill
    ${colors.cyan}description${colors.reset}: A short description of the skill
    ${colors.cyan}license${colors.reset}: MIT
    ${colors.cyan}compatibility${colors.reset}: ">=1.0.0"
    ${colors.cyan}allowed-tools${colors.reset}: Read, Edit, Bash
    ${colors.cyan}metadata${colors.reset}:
      author: your-name
      version: 1.0.0
    ${colors.dim}---${colors.reset}

    # Instructions

    Your skill instructions go here in markdown format.

${colors.bold}FRONTMATTER FIELDS${colors.reset}
    ${colors.yellow}name${colors.reset} ${colors.dim}(required)${colors.reset}
        Unique skill identifier. Must be lowercase letters, numbers, and
        hyphens. Cannot start/end with hyphen. Max 64 characters.

    ${colors.yellow}description${colors.reset} ${colors.dim}(required)${colors.reset}
        Brief description of what the skill does. Max 1024 characters.

    ${colors.yellow}license${colors.reset} ${colors.dim}(optional)${colors.reset}
        SPDX license identifier (e.g., MIT, Apache-2.0).

    ${colors.yellow}compatibility${colors.reset} ${colors.dim}(optional)${colors.reset}
        Semver range for agent compatibility.

    ${colors.yellow}allowed-tools${colors.reset} ${colors.dim}(optional)${colors.reset}
        Comma-separated list of tools the skill can use.

    ${colors.yellow}metadata${colors.reset} ${colors.dim}(optional)${colors.reset}
        Key-value pairs for additional information (author, version, etc.).

${colors.bold}CONTENT SECTION${colors.reset}
    The markdown content after the frontmatter contains the actual skill
    instructions. This is what gets injected into the agent's context.

    Best practices:
    - Use clear, imperative language
    - Structure with headers for readability
    - Include examples when helpful
    - Keep focused on a single capability

${colors.bold}EXAMPLE${colors.reset}
    ${colors.dim}---${colors.reset}
    ${colors.cyan}name${colors.reset}: git-commit
    ${colors.cyan}description${colors.reset}: Helps write better git commit messages
    ${colors.cyan}license${colors.reset}: MIT
    ${colors.dim}---${colors.reset}

    # Git Commit Guidelines

    When writing commit messages:
    - Use conventional commit format
    - Start with type: feat, fix, docs, style, refactor
    - Keep subject line under 72 characters
    - Use imperative mood ("Add feature" not "Added feature")

${colors.bold}CURSOR COMPATIBILITY${colors.reset}
    Cursor now uses the same SKILL.md format as Claude Code.
    Skills are stored in ${colors.cyan}.cursor/skills/${colors.reset} directory.

    Cursor also discovers skills from Claude's directory:
    - .cursor/skills/ (project-level)
    - .claude/skills/ (project-level, Claude compatibility)
    - ~/.cursor/skills/ (global)
    - ~/.claude/skills/ (global)

${colors.bold}SEE ALSO${colors.reset}
    osk man init, osk man convert, osk man validate
`,
};

function formatSkillManPage(
  name: string,
  description: string,
  content: string,
  agent: string,
  path: string
): string {
  return `
${colors.bold}NAME${colors.reset}
    ${name} - ${description}

${colors.bold}AGENT${colors.reset}
    ${agent}

${colors.bold}PATH${colors.reset}
    ${colors.dim}${path}${colors.reset}

${colors.bold}CONTENT${colors.reset}
${content
  .split("\n")
  .map((line) => "    " + line)
  .join("\n")}
`;
}

function getInstalledSkillManPage(skillName: string): string | null {
  const installed = getAllInstalledSkills();
  const matches = installed.filter((s) => s.name === skillName);

  if (matches.length === 0) {
    return null;
  }

  // If multiple agents have this skill, show all
  const pages: string[] = [];

  for (const record of matches) {
    const agent = getAgent(record.agent);
    if (!agent) continue;

    const skillPath = agent.getSkillPath();
    let content = "";
    let description = record.name;

    if (agent.format === "skill.md") {
      const skillMdPath = join(skillPath, record.name, "SKILL.md");
      if (existsSync(skillMdPath)) {
        try {
          const raw = readFileSync(skillMdPath, "utf-8");
          const parsed = parseSkillMd(raw);
          description = parsed.frontmatter.description;
          content = parsed.content;
        } catch {
          content = "(Could not parse skill)";
        }
      } else {
        content = "(Skill file not found)";
      }
    } else if (agent.format === "cursor.mdc") {
      const mdcPath = join(skillPath, `${record.name}.mdc`);
      const mdPath = join(skillPath, `${record.name}.md`);
      const filePath = existsSync(mdcPath) ? mdcPath : mdPath;

      if (existsSync(filePath)) {
        try {
          const raw = readFileSync(filePath, "utf-8");
          const parsed = parseCursorRule(raw);
          description = parsed.frontmatter.description || record.name;
          content = parsed.content;
        } catch {
          content = "(Could not parse rule)";
        }
      } else {
        content = "(Rule file not found)";
      }
    }

    pages.push(formatSkillManPage(record.name, description, content, agent.displayName, skillPath));
  }

  return pages.join("\n" + colors.dim + "─".repeat(60) + colors.reset + "\n");
}

export const manCommand = new Command("man")
  .description("Show detailed help for a command or installed skill")
  .argument("[command]", "Command name or skill name", "osk")
  .action((command: string) => {
    // First check built-in man pages
    const page = manPages[command] || manPages[command.toLowerCase()];

    if (page) {
      logger.log(page);
      return;
    }

    // Check if it's an installed skill
    const skillPage = getInstalledSkillManPage(command);

    if (skillPage) {
      logger.log(skillPage);
      return;
    }

    logger.error(`No manual entry for '${command}'`);
    logger.log(`${colors.bold}Built-in pages:${colors.reset} ${Object.keys(manPages).join(", ")}`);

    const installed = getAllInstalledSkills();
    if (installed.length > 0) {
      const uniqueSkills = [...new Set(installed.map((s) => s.name))];
      logger.log(`${colors.bold}Installed skills:${colors.reset} ${uniqueSkills.join(", ")}`);
    }

    process.exit(1);
  });
