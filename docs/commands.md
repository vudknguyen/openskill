# Command Reference

## Overview

```
osk <command> [options]
```

All commands support `--help` for detailed usage information.

---

## install

Install a skill for an AI coding agent.

```bash
osk install <source> [skill]
```

**Aliases:** `i`

**Arguments:**

- `source` - Repository URL or owner/repo shorthand
- `skill` - Skill name (optional, interactive selection if omitted)

**Options:**

- `-t, --target <agent>` - Target agent (claude, cursor, codex, antigravity)
- `-g, --global` - Install globally (default: project-level)
- `-y, --yes` - Skip confirmation prompts
- `-a, --all` - Install all skills (requires `-t`)

**Examples:**

```bash
# Interactive mode (browse and select)
osk install anthropics/skills

# Install specific skill to specific agent
osk install anthropics/skills pdf -t claude

# Install globally
osk install anthropics/skills pdf -t cursor --global

# Install from any Git URL
osk install https://gitlab.com/team/skills my-skill -t claude

# Install all skills from a repository
osk install anthropics/skills -a -t claude
```

---

## uninstall

Remove an installed skill.

```bash
osk uninstall <skill>
```

**Aliases:** `rm`

**Arguments:**

- `skill` - Skill name to remove

**Options:**

- `-t, --target <agent>` - Target agent (claude, cursor, codex, antigravity)
- `-g, --global` - Remove from global installation
- `-a, --all` - Remove from all agents

**Examples:**

```bash
# Interactive mode (select skill to remove)
osk uninstall

# Remove specific skill (interactive agent selection)
osk uninstall commit-helper

# Remove from specific agent
osk uninstall commit-helper -t claude

# Remove global skill
osk uninstall my-skill -t cursor --global

# Remove from all agents
osk uninstall old-skill --all
```

---

## list

List installed skills.

```bash
osk list [agent]
```

**Aliases:** `ls`

**Arguments:**

- `agent` - Filter by agent (optional)

**Options:**

- `-g, --global` - List global skills only
- `--json` - Output as JSON

**Examples:**

```bash
# List all skills
osk list

# List Claude skills
osk list claude

# JSON output
osk list --json
```

---

## update

Update skills and repositories.

```bash
osk update [skill]
```

**Aliases:** `up`

**Arguments:**

- `skill` - Specific skill to update (optional)

**Options:**

- `--repos-only` - Only update repositories
- `--check` - Check for updates without applying

**Examples:**

```bash
# Update everything
osk update

# Check for updates
osk update --check

# Update repositories only
osk update --repos-only
```

---

## search

Search for skills across repositories.

```bash
osk search <query>
```

**Aliases:** `s`

**Arguments:**

- `query` - Search term

**Options:**

- `--agent <agent>` - Filter by agent compatibility

**Examples:**

```bash
# Search for testing skills
osk search testing

# Search Claude-compatible skills
osk search "code review" --agent claude
```

---

## browse

Browse available skills interactively.

```bash
osk browse
```

**Aliases:** `b`

**Options:**

- `--agent <agent>` - Filter by agent
- `--repo <repo>` - Filter by repository

**Examples:**

```bash
# Browse all skills
osk browse

# Browse Claude skills
osk browse --agent claude
```

---

## repo

Manage skill repositories.

### repo add

Add a skill repository.

```bash
osk repo add <url> [name]
```

**Arguments:**

- `url` - Git repository URL
- `name` - Custom name (optional, auto-generated from URL)

**Examples:**

```bash
# GitHub
osk repo add https://github.com/user/skills

# GitLab
osk repo add https://gitlab.com/team/skills

# Custom Git server
osk repo add git@git.company.com:team/skills.git

# With custom name
osk repo add https://github.com/user/skills my-skills
```

### repo ls

List configured repositories.

```bash
osk repo ls
```

### repo rm

Remove a repository.

```bash
osk repo rm <name>
```

### repo sync

Sync all repositories.

```bash
osk repo sync
```

---

## convert

Convert a skill between agent formats.

```bash
osk convert <skill> --from <agent> --to <agent>
```

**Options:**

- `--from <agent>` - Source agent format
- `--to <agent>` - Target agent format
- `-o, --output <path>` - Output path

**Examples:**

```bash
# Convert Claude skill to Cursor format
osk convert my-skill --from claude --to cursor

# Convert with custom output
osk convert my-skill --from claude --to codex -o ./converted/
```

---

## init

Create a new skill.

```bash
osk init [name]
```

**Arguments:**

- `name` - Skill name (optional, prompted if not provided)

**Options:**

- `--agent <agent>` - Target agent
- `--template <template>` - Use a template

**Examples:**

```bash
# Interactive creation
osk init

# Create with name
osk init my-new-skill

# Create for specific agent
osk init my-skill --agent claude
```

---

## validate

Validate a skill's format.

```bash
osk validate [path]
```

**Arguments:**

- `path` - Path to skill (default: current directory)

**Examples:**

```bash
# Validate current directory
osk validate

# Validate specific path
osk validate ./skills/my-skill
```

---

## which

Show the installation path for a skill.

```bash
osk which <agent> <skill>
```

**Options:**

- `-g, --global` - Show global path

**Examples:**

```bash
osk which claude commit-helper
osk which cursor my-skill --global
```

---

## config

Manage configuration.

### config get

Get a configuration value.

```bash
osk config get <key>
```

### config set

Set a configuration value.

```bash
osk config set <key> <value>
```

### config list

List all configuration.

```bash
osk config list
```

---

## completion

Generate shell completion script.

```bash
osk completion [shell]
```

**Arguments:**

- `shell` - Shell type: bash, zsh, fish (default: bash)

---

## version

Show version information.

```bash
osk version
```

**Aliases:** `v`

**Options:**

- `--json` - Output as JSON

---

## man

Show detailed help for a topic.

```bash
osk man <topic>
```

**Topics:** osk, install, uninstall, list, update, search, browse, repo, convert, init, validate, which, skill
