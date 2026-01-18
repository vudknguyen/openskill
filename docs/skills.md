# Skills

Skills are reusable prompts, workflows, and configurations for AI coding agents. This guide covers the skill format and how to create your own skills.

## Skill Format

A skill is a directory containing a `SKILL.md` file with YAML frontmatter:

```
my-skill/
└── SKILL.md
```

### SKILL.md Structure

```markdown
---
name: my-skill
description: Short description of what the skill does
version: 1.0.0
author: Your Name
tags:
  - testing
  - automation
agents:
  - claude
  - cursor
---

# My Skill

The main content of your skill goes here. This is what the AI agent will read
and follow when the skill is invoked.

## Usage

Explain how to use the skill...

## Examples

Provide examples...
```

### Frontmatter Fields

| Field         | Required | Description                                  |
| ------------- | -------- | -------------------------------------------- |
| `name`        | Yes      | Unique skill identifier (lowercase, hyphens) |
| `description` | Yes      | Brief description (one line)                 |
| `version`     | No       | Semantic version (default: 1.0.0)            |
| `author`      | No       | Skill author name                            |
| `tags`        | No       | List of tags for discovery                   |
| `agents`      | No       | List of compatible agents                    |

---

## Creating a Skill

### Using the CLI

```bash
# Interactive creation
osk init

# Create with name
osk init my-skill

# Create for specific agent
osk init my-skill --agent claude
```

### Manual Creation

1. Create a directory:

   ```bash
   mkdir my-skill
   cd my-skill
   ```

2. Create `SKILL.md`:

   ```markdown
   ---
   name: my-skill
   description: Helps with code reviews
   version: 1.0.0
   tags:
     - review
     - quality
   ---

   # Code Review Helper

   When reviewing code, follow these steps:

   1. Check for bugs and logic errors
   2. Verify error handling
   3. Review naming conventions
   4. Assess code organization

   ## What to Look For

   - Unused variables
   - Missing null checks
   - Hardcoded values
   - Security issues
   ```

### Validating a Skill

```bash
osk validate ./my-skill
```

---

## Skill Content Best Practices

### Be Specific

```markdown
# Good

When writing tests, use descriptive test names that explain the expected behavior.
Use the format: `test_<function>_<scenario>_<expected_result>`

# Bad

Write good tests.
```

### Provide Examples

````markdown
## Examples

### Input

```python
def calculate_total(items):
    return sum(item.price for item in items)
```
````

### Expected Output

```python
def calculate_total(items: list[Item]) -> float:
    """Calculate the total price of all items."""
    if not items:
        return 0.0
    return sum(item.price for item in items)
```

````

### Structure with Headers

Use markdown headers to organize content:

```markdown
# Main Skill Title

## When to Use
...

## How to Use
...

## Examples
...

## Common Mistakes
...
````

### Keep It Focused

One skill should do one thing well. Create separate skills for different tasks.

---

## Publishing Skills

### Repository Structure

Organize skills in a Git repository:

```
my-skills-repo/
├── README.md
├── skills/
│   ├── code-review/
│   │   └── SKILL.md
│   ├── testing/
│   │   └── SKILL.md
│   └── documentation/
│       └── SKILL.md
└── manifest.json (optional)
```

### manifest.json (Optional)

Provide metadata for the repository:

```json
{
  "name": "my-skills",
  "description": "A collection of helpful skills",
  "version": "1.0.0",
  "skills": [
    {
      "name": "code-review",
      "path": "skills/code-review",
      "description": "Helps with code reviews"
    },
    {
      "name": "testing",
      "path": "skills/testing",
      "description": "Testing best practices"
    }
  ]
}
```

### Publishing Steps

1. Create a Git repository (GitHub, GitLab, etc.)
2. Add your skills following the structure above
3. Push to remote
4. Share the repository URL

Users can then add your repository:

```bash
osk repo add https://github.com/username/my-skills
osk browse
```

---

## Skill Discovery

### Search

```bash
# Search by keyword
osk search "code review"

# Search with agent filter
osk search testing --agent claude
```

### Browse

```bash
# Interactive browser
osk browse

# Filter by agent
osk browse --agent cursor

# Filter by repository
osk browse --repo my-skills
```

### Tags

Use tags in your skill frontmatter for better discovery:

```yaml
tags:
  - testing
  - python
  - automation
  - ci-cd
```

---

## Skill Versioning

Use semantic versioning for skills:

- **MAJOR** (1.0.0 → 2.0.0): Breaking changes
- **MINOR** (1.0.0 → 1.1.0): New features, backwards compatible
- **PATCH** (1.0.0 → 1.0.1): Bug fixes

Update the version in frontmatter when making changes:

```yaml
---
name: my-skill
version: 1.2.0
---
```

Check for updates:

```bash
osk update --check
```
