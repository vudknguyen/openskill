# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## Reporting a Vulnerability

We take security seriously. If you discover a security vulnerability, please report it responsibly.

### How to Report

**Do not report security vulnerabilities through public GitHub issues.**

Instead, please send an email to the project maintainers with:

1. **Description** of the vulnerability
2. **Steps to reproduce** the issue
3. **Potential impact** of the vulnerability
4. **Suggested fix** (if you have one)

### What to Expect

- **Acknowledgment**: We will acknowledge receipt within 48 hours
- **Assessment**: We will assess the vulnerability and its impact
- **Timeline**: We aim to provide a fix within 30 days for critical issues
- **Credit**: We will credit you in the security advisory (unless you prefer to remain anonymous)

## Security Measures

OpenSkill implements several security measures:

### Path Traversal Protection

- All file paths are validated to prevent directory traversal attacks
- Skill names are sanitized before filesystem operations

### Symlink Attack Prevention

- Symlinks are detected and rejected during skill installation
- File operations verify the target is a regular file or directory

### Git Command Injection Prevention

- All Git arguments are properly escaped
- User input is never passed directly to shell commands

### Atomic File Writes

- File writes use atomic operations with proper locking
- Prevents race conditions and partial writes

## Best Practices for Users

1. **Verify skill sources**: Only install skills from trusted repositories
2. **Review skill content**: Check the skill's SKILL.md before installation
3. **Keep updated**: Run `osk update` regularly to get security fixes
4. **Use HTTPS**: Prefer HTTPS URLs over SSH for public repositories

## Security Advisories

Security advisories will be published on the [GitHub Security Advisories](https://github.com/vudknguyen/openskill/security/advisories) page.
