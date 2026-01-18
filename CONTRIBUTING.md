# Contributing to OpenSkill

Thank you for your interest in contributing to OpenSkill! This document provides guidelines and information for contributors.

## Code of Conduct

Please read and follow our [Code of Conduct](CODE_OF_CONDUCT.md).

## Getting Started

1. **Fork the repository** and clone your fork
2. **Install dependencies**: `npm install`
3. **Build the project**: `npm run build`
4. **Run tests**: `npm test`

## Development Workflow

### Setting Up Development Environment

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/openskill.git
cd openskill

# Install dependencies
npm install

# Build TypeScript
npm run build

# Run in watch mode for development
npm run dev
```

### Running the CLI Locally

```bash
# Run directly
node dist/cli/index.js <command>

# Or link globally
npm link
osk <command>
```

### Running Tests

```bash
# Run all tests
npm test

# Run tests once (no watch)
npm test -- --run

# Run specific test file
npm test -- src/__tests__/config.test.ts
```

### Linting and Formatting

```bash
# Run ESLint
npm run lint

# Fix ESLint errors automatically
npm run lint:fix

# Check formatting
npm run format:check

# Format all files
npm run format

# Run all checks (lint + format + build + test)
npm run check
```

## Project Structure

```
src/
├── cli/           # Command handlers (commander.js)
├── core/          # Business logic
├── agents/        # Agent adapters
└── utils/         # Utility functions
```

## Making Changes

### Branch Naming

- `feature/description` - New features
- `fix/description` - Bug fixes
- `docs/description` - Documentation updates
- `refactor/description` - Code refactoring

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
type(scope): description

[optional body]

[optional footer]
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

Examples:

- `feat(install): add support for GitLab repositories`
- `fix(config): handle missing config file gracefully`
- `docs: update README with new commands`

### Code Style

- Use TypeScript for all source files
- Run `npm run check` before committing (lint + format + build + test)
- Follow existing code patterns
- Add tests for new functionality
- Code is auto-formatted with Prettier

## Pull Request Process

1. **Create a branch** from `main`
2. **Make your changes** with clear commits
3. **Add tests** for new functionality
4. **Update documentation** if needed
5. **Run tests** to ensure they pass
6. **Submit a PR** with a clear description

### PR Requirements

- [ ] All checks pass (`npm run check`)
- [ ] Tests pass (`npm test`)
- [ ] Code builds (`npm run build`)
- [ ] No linting errors (`npm run lint`)
- [ ] Code is formatted (`npm run format:check`)
- [ ] Documentation updated (if applicable)
- [ ] PR description explains the changes

## Adding a New Agent

To add support for a new AI coding agent:

1. Create a new file in `src/agents/` (e.g., `newagent.ts`)
2. Implement the `Agent` interface from `src/agents/types.ts`
3. Register the agent in `src/agents/index.ts`
4. Add tests in `src/__tests__/agent.test.ts`
5. Update documentation

Example agent implementation:

```typescript
import { Agent, AgentInfo, InstalledSkill } from "./types.js";

export const newAgent: Agent = {
  info: {
    id: "newagent",
    name: "New Agent",
    configDir: ".newagent",
    skillsDir: "skills",
    skillFile: "SKILL.md",
  },

  async getInstalledSkills(): Promise<InstalledSkill[]> {
    // Implementation
  },

  async installSkill(name, content, options): Promise<void> {
    // Implementation
  },

  async uninstallSkill(name, options): Promise<boolean> {
    // Implementation
  },
};
```

## Reporting Issues

- Use the [bug report template](.github/ISSUE_TEMPLATE/bug_report.yml) for bugs
- Use the [feature request template](.github/ISSUE_TEMPLATE/feature_request.yml) for features
- Include as much detail as possible

## Questions?

Feel free to open a [discussion](https://github.com/vudknguyen/openskill/discussions) for questions or ideas.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
