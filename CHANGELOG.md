# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-01-18

### Added

- Initial release of OpenSkill CLI
- Support for multiple AI coding agents: Claude Code, Cursor, Codex, Antigravity
- Install skills from any Git repository (GitHub, GitLab, SSH, self-hosted)
- Interactive skill and agent selection with autocomplete
- Shell completion for bash, zsh, and fish
- Skill repository management (`osk repo add/ls/rm/sync`)
- Skill search and browse functionality
- Skill format conversion between agents
- Skill validation and initialization
- Global and project-level skill installation
- Update checking for installed skills
- Detailed manual pages (`osk man <command>`)
- Version command with JSON output support

### Security

- Path traversal protection
- Symlink attack prevention
- Git command injection prevention
- Atomic file writes with locking

[Unreleased]: https://github.com/vudknguyen/openskill/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/vudknguyen/openskill/releases/tag/v0.1.0
