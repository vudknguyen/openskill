```
                            _    _ _ _
  ___  _ __   ___ _ __  ___| | _(_) | |
 / _ \| '_ \ / _ \ '_ \/ __| |/ / | | |
| (_) | |_) |  __/ | | \__ \   <| | | |
 \___/| .__/ \___|_| |_|___/_|\_\_|_|_|
      |_|
```

# OpenSkill (osk)

**Agent-agnostic skill manager for AI coding assistants**

OpenSkill is a lightweight CLI tool for managing skills across multiple AI coding agents. Install, update, and share skills seamlessly between Claude Code, Cursor, OpenAI Codex, and Antigravity.

## Features

- **Multi-agent support** - Works with Claude Code, Cursor, OpenAI Codex, and Antigravity
- **Unified skill format** - SKILL.md format compatible across all agents
- **Project & global scopes** - Install skills per-project or globally
- **Repository management** - Browse, search, and sync skill repositories
- **Interactive installation** - Searchable multi-select for easy skill discovery

## Installation

```bash
npm install -g openskill
```

## Quick Start

```bash
# Browse available skills
osk browse

# Search for a skill
osk search pdf

# Install a skill (interactive)
osk install anthropics/skills

# Install specific skill to specific agent
osk install anthropics/skills pdf -t claude

# Install globally (available in all projects)
osk install anthropics/skills pdf -g

# List installed skills
osk ls

# Update skills
osk update
```

## Commands

| Command                    | Alias | Description                        |
| -------------------------- | ----- | ---------------------------------- |
| `install <source> [skill]` | `i`   | Install skills from a repository   |
| `uninstall <skill>`        | `rm`  | Remove installed skills            |
| `list`                     | `ls`  | List installed skills              |
| `update`                   | `up`  | Check and apply skill updates      |
| `search <query>`           | `s`   | Search for skills in repositories  |
| `browse`                   | `b`   | Browse available skills            |
| `repo add <source>`        |       | Add a skill repository             |
| `repo ls`                  |       | List configured repositories       |
| `repo rm <name>`           |       | Remove a repository                |
| `repo sync [name]`         |       | Sync repositories (fetch latest)   |
| `repo info <name>`         |       | Show repository details            |
| `config`                   |       | Manage configuration               |
| `init`                     |       | Create a new skill                 |
| `validate`                 |       | Validate skill format              |
| `convert`                  |       | Convert skills between formats     |
| `which`                    |       | Show installation path for a skill |
| `man`                      |       | Show detailed help                 |
| `completion`               |       | Generate shell completion script   |

## Supported Agents

| Agent        | Project Path           | Global Path              |
| ------------ | ---------------------- | ------------------------ |
| Claude Code  | `.claude/skills/`      | `~/.claude/skills/`      |
| Cursor       | `.cursor/skills/`      | `~/.cursor/skills/`      |
| OpenAI Codex | `.codex/skills/`       | `~/.codex/skills/`       |
| Antigravity  | `.antigravity/skills/` | `~/.antigravity/skills/` |

## Skill Format

Skills use the SKILL.md format with YAML frontmatter:

```markdown
---
name: my-skill
description: A short description of what this skill does
license: MIT
---

# Instructions

Your skill instructions go here in markdown format.
```

## Configuration

Configuration is stored at `~/.openskill/config.json`.

```bash
# Show current config
osk config

# Set default agent
osk config set defaultAgent cursor

# Set default scope (project or global)
osk config set defaultScope global
```

## Repository Management

```bash
# List configured repositories
osk repo ls

# Add a repository (GitHub shorthand)
osk repo add owner/repo

# Add from GitLab
osk repo add https://gitlab.com/user/repo

# Add via SSH
osk repo add git@github.com:user/repo.git --name my-skills

# Sync all repositories
osk repo sync

# Show repository details
osk repo info anthropic-official

# Remove a repository
osk repo rm my-skills
```

## Shell Completion

Generate shell completion scripts for your shell:

```bash
# Bash
osk completion bash >> ~/.bashrc

# Zsh
osk completion zsh >> ~/.zshrc

# Fish
osk completion fish > ~/.config/fish/completions/osk.fish
```

## Default Repositories

OpenSkill comes pre-configured with official skill repositories:

- **anthropic-official** - https://github.com/anthropics/skills
- **openai-official** - https://github.com/openai/skills

You can add any Git repository (GitHub, GitLab, self-hosted, SSH) using `osk repo add`.

## Documentation

Full documentation is available in the [docs/](docs/) directory:

- [Getting Started](docs/getting-started.md) - Installation and first steps
- [Commands](docs/commands.md) - Complete command reference
- [Agents](docs/agents.md) - Supported agents and configuration
- [Skills](docs/skills.md) - Skill format and creation guide
- [Repositories](docs/repositories.md) - Managing skill repositories
- [Architecture](docs/architecture.md) - Project structure and internals

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

## License

MIT
