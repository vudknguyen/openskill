# Repositories

OpenSkill uses Git repositories as the source for skills. You can use repositories from GitHub, GitLab, self-hosted Git servers, or any Git URL.

## Adding Repositories

### From GitHub

```bash
# HTTPS
osk repo add https://github.com/username/skills

# With custom name
osk repo add https://github.com/username/skills my-skills
```

### From GitLab

```bash
osk repo add https://gitlab.com/username/skills
```

### From Self-Hosted Git

```bash
# SSH
osk repo add git@git.company.com:team/skills.git

# HTTPS with authentication
osk repo add https://git.company.com/team/skills.git
```

### From Any Git URL

```bash
# Generic Git URL
osk repo add https://example.com/repo.git

# With branch
osk repo add https://github.com/user/skills#develop
```

## Managing Repositories

### List Repositories

```bash
osk repo ls
```

Output:

```
Configured repositories:
  • my-skills (https://github.com/user/skills)
  • company-skills (git@git.company.com:team/skills.git)
```

### Remove a Repository

```bash
osk repo rm my-skills
```

### Sync Repositories

Update all repositories to latest:

```bash
osk repo sync
```

## Repository Structure

A skill repository should follow this structure:

```
my-skills-repo/
├── README.md           # Repository documentation
├── manifest.json       # Optional: skill metadata
└── skills/
    ├── skill-one/
    │   └── SKILL.md
    ├── skill-two/
    │   └── SKILL.md
    └── skill-three/
        └── SKILL.md
```

### manifest.json

Optional file that provides metadata about the repository and its skills:

```json
{
  "name": "my-skills",
  "description": "A collection of helpful AI coding skills",
  "version": "1.0.0",
  "author": "Your Name",
  "homepage": "https://github.com/user/skills",
  "skills": [
    {
      "name": "code-review",
      "path": "skills/code-review",
      "description": "Automated code review assistance",
      "tags": ["review", "quality"]
    },
    {
      "name": "testing",
      "path": "skills/testing",
      "description": "Testing best practices",
      "tags": ["testing", "tdd"]
    }
  ]
}
```

## Installing Skills from Repositories

### Browse and Install

```bash
# Browse all available skills
osk browse

# Browse from specific repository
osk browse --repo my-skills
```

### Direct Install

```bash
# Install by name (from any configured repo)
osk install claude skill-name

# Install from specific URL
osk install claude https://github.com/user/repo/tree/main/skills/my-skill
```

## URL Formats

OpenSkill accepts various Git URL formats:

| Format        | Example                                              |
| ------------- | ---------------------------------------------------- |
| GitHub HTTPS  | `https://github.com/user/repo`                       |
| GitHub SSH    | `git@github.com:user/repo.git`                       |
| GitLab HTTPS  | `https://gitlab.com/user/repo`                       |
| GitLab SSH    | `git@gitlab.com:user/repo.git`                       |
| Generic HTTPS | `https://git.example.com/repo.git`                   |
| Generic SSH   | `git@git.example.com:repo.git`                       |
| With branch   | `https://github.com/user/repo#branch`                |
| Skill path    | `https://github.com/user/repo/tree/main/skills/name` |

## Repository Storage

Repositories are cloned to:

```
~/.openskill/repos/<repo-name>/
```

Configuration is stored in:

```
~/.openskill/config.json
```

## Authentication

### SSH Keys

For SSH URLs, ensure your SSH key is configured:

```bash
# Test SSH access
ssh -T git@github.com
```

### HTTPS with Credentials

For private repositories over HTTPS, Git will prompt for credentials or use your credential helper:

```bash
# Configure credential helper
git config --global credential.helper store
```

## Troubleshooting

### Repository Not Found

```bash
# Check URL is accessible
git ls-remote https://github.com/user/repo

# Verify repository is added
osk repo ls
```

### Sync Errors

```bash
# Force re-clone
osk repo rm my-repo
osk repo add https://github.com/user/repo my-repo
```

### Permission Denied

For SSH:

```bash
# Check SSH key
ssh-add -l

# Add SSH key
ssh-add ~/.ssh/id_ed25519
```

For HTTPS:

```bash
# Check credentials
git config --global credential.helper
```
