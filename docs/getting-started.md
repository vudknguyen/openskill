# Getting Started

## Installation

### npm (Recommended)

```bash
npm install -g openskill-cli
```

### npx (No Installation)

```bash
npx openskill-cli --help
```

### Standalone Binary

Download from [GitHub Releases](https://github.com/vudknguyen/openskill/releases):

| Platform | Architecture  | File              |
| -------- | ------------- | ----------------- |
| macOS    | Apple Silicon | `osk-macos-arm64` |
| macOS    | Intel         | `osk-macos-x64`   |
| Linux    | x64           | `osk-linux-x64`   |
| Linux    | ARM64         | `osk-linux-arm64` |
| Windows  | x64           | `osk-win-x64.exe` |

```bash
# macOS/Linux
curl -L -o osk https://github.com/vudknguyen/openskill/releases/latest/download/osk-macos-arm64
chmod +x osk
sudo mv osk /usr/local/bin/
```

## Verify Installation

```bash
osk version
```

## Shell Completion

Enable tab completion for your shell:

```bash
# Bash
osk completion bash >> ~/.bashrc

# Zsh
osk completion zsh >> ~/.zshrc

# Fish
osk completion fish > ~/.config/fish/completions/osk.fish
```

## First Steps

### 1. Add a Skill Repository

```bash
# Add from GitHub
osk repo add https://github.com/example/skills

# Add from GitLab
osk repo add https://gitlab.com/example/skills

# Add from any Git URL
osk repo add git@git.company.com:team/skills.git
```

### 2. Browse Available Skills

```bash
# Interactive browser
osk browse

# Search for specific skills
osk search "testing"
```

### 3. Install a Skill

```bash
# Interactive installation
osk install

# Direct installation
osk install claude skill-name

# Install from URL
osk install claude https://github.com/user/repo/tree/main/skills/my-skill
```

### 4. List Installed Skills

```bash
# List for all agents
osk list

# List for specific agent
osk list claude
```

## Directory Structure

OpenSkill stores data in:

```
~/.openskill/
├── config.json      # Configuration file
├── repos/           # Cloned skill repositories
│   └── <repo-name>/ # Individual repository
└── cache/           # Temporary cache
```

Skills are installed to agent-specific directories:

| Agent       | Global Location          | Project Location       |
| ----------- | ------------------------ | ---------------------- |
| Claude      | `~/.claude/skills/`      | `.claude/skills/`      |
| Cursor      | `~/.cursor/skills/`      | `.cursor/skills/`      |
| Codex       | `~/.codex/skills/`       | `.codex/skills/`       |
| Antigravity | `~/.antigravity/skills/` | `.antigravity/skills/` |

## Next Steps

- [Commands Reference](commands.md) - Learn all available commands
- [Skills Guide](skills.md) - Create your own skills
- [Repositories](repositories.md) - Manage skill sources
