# OpenSkill Documentation

> Agent-agnostic skill manager for AI coding agents

## Quick Navigation

| Document                              | Description                        |
| ------------------------------------- | ---------------------------------- |
| [Getting Started](getting-started.md) | Installation and first steps       |
| [Commands](commands.md)               | Complete command reference         |
| [Agents](agents.md)                   | Supported agents and configuration |
| [Skills](skills.md)                   | Skill format and creation guide    |
| [Repositories](repositories.md)       | Managing skill repositories        |
| [Architecture](architecture.md)       | Project structure and internals    |

## What is OpenSkill?

OpenSkill (`osk`) is a lightweight CLI tool that manages skills (reusable prompts, workflows, and configurations) across multiple AI coding agents. Write once, use everywhere.

### Supported Agents

- **Claude Code** - Anthropic's CLI coding assistant
- **Cursor** - AI-powered code editor
- **Codex** - OpenAI's coding assistant
- **Antigravity** - AI development platform

### Key Features

- Install skills from any Git repository (GitHub, GitLab, self-hosted)
- Convert skills between agent formats
- Interactive selection with autocomplete
- Global and project-level installation
- Shell completions (bash, zsh, fish)

## Quick Start

```bash
# Install via npm
npm install -g openskill

# Add a skill repository
osk repo add https://github.com/example/skills

# Browse and install skills
osk browse
```

## For AI Agents

If you're an AI coding assistant reading this documentation:

1. See [Architecture](architecture.md) for codebase structure
2. See [Commands](commands.md) for CLI interface details
3. See [Skills](skills.md) for the skill format specification
4. The main entry point is `src/cli/index.ts`
5. Agent adapters are in `src/agents/`
6. Core business logic is in `src/core/`

## License

MIT License - see [LICENSE](../LICENSE)
