# Architecture

This document describes the internal architecture of OpenSkill. It's intended for contributors and AI agents working with the codebase.

## Project Structure

```
src/
├── cli/              # Command-line interface
│   ├── index.ts      # Entry point, command registration
│   ├── install.ts    # Install command
│   ├── uninstall.ts  # Uninstall command
│   ├── list.ts       # List command
│   ├── update.ts     # Update command
│   ├── search.ts     # Search command
│   ├── browse.ts     # Browse command
│   ├── repo.ts       # Repository management
│   ├── convert.ts    # Format conversion
│   ├── init.ts       # Skill initialization
│   ├── validate.ts   # Skill validation
│   ├── config.ts     # Configuration commands
│   ├── man.ts        # Manual pages
│   ├── which.ts      # Path lookup
│   ├── completion.ts # Shell completions
│   └── version.ts    # Version command
├── core/             # Business logic
│   ├── config.ts     # Configuration management
│   ├── git.ts        # Git operations
│   ├── skill.ts      # Skill parsing/validation
│   ├── registry.ts   # Repository registry
│   └── manifest.ts   # Installed skills tracking
├── agents/           # Agent adapters
│   ├── types.ts      # Agent interface
│   ├── index.ts      # Agent registry
│   ├── claude.ts     # Claude Code adapter
│   ├── cursor.ts     # Cursor adapter
│   ├── codex.ts      # Codex adapter
│   └── antigravity.ts # Antigravity adapter
└── utils/            # Utilities
    ├── logger.ts     # Colored console output
    ├── prompt.ts     # Interactive prompts
    ├── markdown.ts   # Frontmatter parsing
    └── fs.ts         # File system helpers
```

## Key Concepts

### Agent Interface

All agents implement the `Agent` interface from `src/agents/types.ts`:

```typescript
interface Agent {
  info: AgentInfo;
  getInstalledSkills(): Promise<InstalledSkill[]>;
  installSkill(name: string, content: string, options?: InstallOptions): Promise<void>;
  uninstallSkill(name: string, options?: InstallOptions): Promise<boolean>;
}

interface AgentInfo {
  id: string; // e.g., "claude"
  name: string; // e.g., "Claude Code"
  configDir: string; // e.g., ".claude"
  skillsDir: string; // e.g., "skills"
  skillFile: string; // e.g., "SKILL.md"
}
```

### Configuration

Configuration is stored in `~/.openskill/config.json`:

```typescript
interface Config {
  version: number;
  repos: RepoConfig[];
  settings: Settings;
}

interface RepoConfig {
  name: string;
  url: string;
}
```

Managed by `src/core/config.ts`. Config has version-based migrations.

### Skill Format

Skills use markdown with YAML frontmatter:

```typescript
interface SkillMetadata {
  name: string;
  description: string;
  version?: string;
  author?: string;
  tags?: string[];
  agents?: string[];
}
```

Parsed by `src/utils/markdown.ts` using `gray-matter`.

## Data Flow

### Installing a Skill

```
User runs: osk install claude my-skill
                    │
                    ▼
            ┌───────────────┐
            │  cli/install  │ Parse arguments
            └───────────────┘
                    │
                    ▼
            ┌───────────────┐
            │ core/registry │ Find skill in repos
            └───────────────┘
                    │
                    ▼
            ┌───────────────┐
            │   core/git    │ Clone/fetch if needed
            └───────────────┘
                    │
                    ▼
            ┌───────────────┐
            │  core/skill   │ Parse and validate
            └───────────────┘
                    │
                    ▼
            ┌───────────────┐
            │ agents/claude │ Install to ~/.claude/skills/
            └───────────────┘
```

### Repository Management

```
User runs: osk repo add <url>
                    │
                    ▼
            ┌───────────────┐
            │   cli/repo    │ Parse URL
            └───────────────┘
                    │
                    ▼
            ┌───────────────┐
            │   utils/fs    │ parseGitUrl()
            └───────────────┘
                    │
                    ▼
            ┌───────────────┐
            │  core/config  │ Add to config.json
            └───────────────┘
                    │
                    ▼
            ┌───────────────┐
            │   core/git    │ Clone to ~/.openskill/repos/
            └───────────────┘
```

## Dependencies

Minimal by design - only 3 runtime dependencies:

| Dependency          | Purpose             | Location                |
| ------------------- | ------------------- | ----------------------- |
| `commander`         | CLI framework       | `src/cli/*.ts`          |
| `gray-matter`       | YAML frontmatter    | `src/utils/markdown.ts` |
| `@inquirer/prompts` | Interactive prompts | `src/utils/prompt.ts`   |

All other functionality uses Node.js built-ins.

## Adding New Agents

1. Create `src/agents/newagent.ts`:

```typescript
import { Agent, AgentInfo, InstalledSkill, InstallOptions } from "./types.js";
import { join } from "path";
import { homedir } from "os";
import { existsSync, mkdirSync, writeFileSync, rmSync, readdirSync, readFileSync } from "fs";

const info: AgentInfo = {
  id: "newagent",
  name: "New Agent",
  configDir: ".newagent",
  skillsDir: "skills",
  skillFile: "SKILL.md",
};

function getSkillsDir(global: boolean): string {
  const base = global ? join(homedir(), info.configDir) : join(process.cwd(), info.configDir);
  return join(base, info.skillsDir);
}

export const newAgent: Agent = {
  info,

  async getInstalledSkills(): Promise<InstalledSkill[]> {
    const skills: InstalledSkill[] = [];
    for (const global of [true, false]) {
      const dir = getSkillsDir(global);
      if (!existsSync(dir)) continue;

      for (const name of readdirSync(dir)) {
        const skillFile = join(dir, name, info.skillFile);
        if (existsSync(skillFile)) {
          skills.push({
            name,
            path: join(dir, name),
            global,
            agent: info.id,
          });
        }
      }
    }
    return skills;
  },

  async installSkill(name: string, content: string, options?: InstallOptions): Promise<void> {
    const dir = getSkillsDir(options?.global ?? false);
    const skillDir = join(dir, name);

    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, info.skillFile), content);
  },

  async uninstallSkill(name: string, options?: InstallOptions): Promise<boolean> {
    const dir = getSkillsDir(options?.global ?? false);
    const skillDir = join(dir, name);

    if (!existsSync(skillDir)) return false;
    rmSync(skillDir, { recursive: true });
    return true;
  },
};
```

2. Register in `src/agents/index.ts`:

```typescript
import { newAgent } from "./newagent.js";

export const agents: Record<string, Agent> = {
  claude: claudeAgent,
  cursor: cursorAgent,
  codex: codexAgent,
  antigravity: antigravityAgent,
  newagent: newAgent, // Add here
};
```

3. Add tests in `src/__tests__/agent.test.ts`

4. Update documentation

## Testing

Tests use Vitest and are located in `src/__tests__/`:

```bash
# Run all tests
npm test

# Run specific test
npm test -- src/__tests__/config.test.ts

# Run once (no watch)
npm test -- --run
```

Test files:

- `agent.test.ts` - Agent adapter tests
- `config.test.ts` - Configuration tests
- `fs.test.ts` - File system utility tests
- `git.test.ts` - Git operation tests
- `logger.test.ts` - Logger tests
- `manifest.test.ts` - Manifest parsing tests
- `markdown.test.ts` - Frontmatter parsing tests
- `skill.test.ts` - Skill validation tests

## Build Process

### Development

```bash
npm run dev    # Watch mode
```

### Production

```bash
npm run build  # Compile TypeScript
```

### Standalone Binaries

```bash
npm run build:binaries
```

Uses esbuild for bundling and @yao-pkg/pkg for compilation.

## Security Measures

1. **Path Traversal Protection** - `src/utils/fs.ts`
   - `isPathWithin()` - Validates target path is within base directory
   - `safeJoinPath()` - Safely joins user input to base path

2. **Input Validation** - `src/utils/fs.ts`
   - `isValidConfigRepoName()` - Validates repository config names
   - `isValidRepoPathName()` - Validates Git owner/repo names
   - `parseGitUrl()` - Validates and parses Git URLs

3. **Git Injection Prevention** - `src/core/git.ts`
   - Uses `execFileSync` (not `exec`) to avoid shell interpolation
   - Validates commit hashes and limit parameters

4. **Atomic Writes** - `src/core/manifest.ts`
   - Write to temp file, then rename
   - File locking for concurrent access
