# Agents

OpenSkill supports multiple AI coding agents. Each agent has its own configuration directory and skill format preferences.

## Supported Agents

| Agent       | ID            | Config Directory  | Skills Directory |
| ----------- | ------------- | ----------------- | ---------------- |
| Claude Code | `claude`      | `~/.claude/`      | `skills/`        |
| Cursor      | `cursor`      | `~/.cursor/`      | `skills/`        |
| Codex       | `codex`       | `~/.codex/`       | `skills/`        |
| Antigravity | `antigravity` | `~/.antigravity/` | `skills/`        |

---

## Claude Code

[Claude Code](https://claude.ai/code) is Anthropic's CLI coding assistant.

### Skill Location

```
# Global
~/.claude/skills/<skill-name>/SKILL.md

# Project-level
.claude/skills/<skill-name>/SKILL.md
```

### Skill Format

Claude Code uses markdown files with YAML frontmatter:

```markdown
---
name: my-skill
description: A helpful skill
version: 1.0.0
---

# My Skill

Instructions for Claude...
```

### Configuration

Claude Code reads skills from the `skills/` subdirectory of its config directory.

---

## Cursor

[Cursor](https://cursor.sh) is an AI-powered code editor.

### Skill Location

```
# Global
~/.cursor/skills/<skill-name>/SKILL.md

# Project-level
.cursor/skills/<skill-name>/SKILL.md
```

### Skill Format

Same markdown format with YAML frontmatter:

```markdown
---
name: my-skill
description: A helpful skill for Cursor
version: 1.0.0
---

# My Skill

Instructions for Cursor...
```

---

## Codex

[Codex](https://openai.com) is OpenAI's coding assistant.

### Skill Location

```
# Global
~/.codex/skills/<skill-name>/SKILL.md

# Project-level
.codex/skills/<skill-name>/SKILL.md
```

### Skill Format

```markdown
---
name: my-skill
description: A helpful skill for Codex
version: 1.0.0
---

# My Skill

Instructions for Codex...
```

---

## Antigravity

[Antigravity](https://antigravity.ai) is an AI development platform.

### Skill Location

```
# Global
~/.antigravity/skills/<skill-name>/SKILL.md

# Project-level
.antigravity/skills/<skill-name>/SKILL.md
```

### Skill Format

```markdown
---
name: my-skill
description: A helpful skill for Antigravity
version: 1.0.0
---

# My Skill

Instructions for Antigravity...
```

---

## Agent Detection

OpenSkill automatically detects which agents are available on your system by checking for their configuration directories.

```bash
# List detected agents
osk list
```

---

## Converting Between Agents

Skills can be converted between agent formats:

```bash
# Convert Claude skill to Cursor format
osk convert my-skill --from claude --to cursor

# Convert with custom output path
osk convert my-skill --from claude --to codex -o ./converted/
```

The conversion process:

1. Reads the source skill
2. Adjusts agent-specific instructions
3. Updates the frontmatter
4. Writes to the target format

---

## Adding New Agents

To add support for a new agent, see the [Architecture](architecture.md#adding-new-agents) documentation.

The agent interface is defined in `src/agents/types.ts`:

```typescript
interface Agent {
  info: AgentInfo;
  getInstalledSkills(): Promise<InstalledSkill[]>;
  installSkill(name: string, content: string, options?: InstallOptions): Promise<void>;
  uninstallSkill(name: string, options?: InstallOptions): Promise<boolean>;
}
```
