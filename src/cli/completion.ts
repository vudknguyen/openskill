import { Command } from "commander";
import { logger } from "../utils/logger.js";

const bashCompletion = `# osk bash completion
_osk_completions() {
  local cur="\${COMP_WORDS[COMP_CWORD]}"
  local prev="\${COMP_WORDS[COMP_CWORD-1]}"

  local commands="install uninstall list update search browse repo convert init validate man which config completion version"
  local agents="claude antigravity codex cursor"

  case "\${prev}" in
    osk|openskill)
      COMPREPLY=( $(compgen -W "\${commands}" -- "\${cur}") )
      return 0
      ;;
    install|i)
      COMPREPLY=( $(compgen -W "\${agents}" -- "\${cur}") )
      return 0
      ;;
    uninstall|rm)
      COMPREPLY=( $(compgen -W "\${agents}" -- "\${cur}") )
      return 0
      ;;
    list|ls)
      COMPREPLY=( $(compgen -W "\${agents}" -- "\${cur}") )
      return 0
      ;;
    man)
      COMPREPLY=( $(compgen -W "osk install uninstall list update search browse repo convert init validate man which skill" -- "\${cur}") )
      return 0
      ;;
  esac

  COMPREPLY=()
}

complete -F _osk_completions osk
complete -F _osk_completions openskill
`;

const zshCompletion = `#compdef osk openskill

_osk() {
  local -a commands agents
  commands=(
    'install:Install a skill from a repository'
    'uninstall:Uninstall a skill'
    'list:List installed skills'
    'update:Update skills and repositories'
    'search:Search for skills in repositories'
    'browse:Browse available skills from repositories'
    'repo:Manage skill repositories'
    'convert:Convert skill between formats'
    'init:Create a new skill'
    'validate:Validate skill format'
    'man:Show detailed help'
    'which:Show installation path for a skill'
    'config:Manage configuration'
    'completion:Generate shell completion'
    'version:Show version information'
  )

  agents=(
    'claude:Claude Code'
    'antigravity:Antigravity'
    'codex:OpenAI Codex'
    'cursor:Cursor'
  )

  _arguments -C \\
    '1: :->command' \\
    '*: :->args'

  case $state in
    command)
      _describe -t commands 'osk commands' commands
      ;;
    args)
      case $words[2] in
        install|i|uninstall|rm|list|ls)
          _describe -t agents 'agents' agents
          ;;
        man)
          local -a topics
          topics=(osk install uninstall list update search browse repo convert init validate man which skill)
          _describe -t topics 'topics' topics
          ;;
      esac
      ;;
  esac
}

_osk "$@"
`;

const fishCompletion = `# osk fish completion

# Disable file completion
complete -c osk -f
complete -c openskill -f

# Commands
complete -c osk -n "__fish_use_subcommand" -a "install" -d "Install a skill"
complete -c osk -n "__fish_use_subcommand" -a "uninstall" -d "Uninstall a skill"
complete -c osk -n "__fish_use_subcommand" -a "list" -d "List installed skills"
complete -c osk -n "__fish_use_subcommand" -a "update" -d "Update skills"
complete -c osk -n "__fish_use_subcommand" -a "search" -d "Search for skills"
complete -c osk -n "__fish_use_subcommand" -a "browse" -d "Browse available skills"
complete -c osk -n "__fish_use_subcommand" -a "repo" -d "Manage repositories"
complete -c osk -n "__fish_use_subcommand" -a "convert" -d "Convert skill format"
complete -c osk -n "__fish_use_subcommand" -a "init" -d "Create a new skill"
complete -c osk -n "__fish_use_subcommand" -a "validate" -d "Validate skill"
complete -c osk -n "__fish_use_subcommand" -a "man" -d "Show help"
complete -c osk -n "__fish_use_subcommand" -a "which" -d "Show skill path"
complete -c osk -n "__fish_use_subcommand" -a "config" -d "Manage config"
complete -c osk -n "__fish_use_subcommand" -a "completion" -d "Shell completion"
complete -c osk -n "__fish_use_subcommand" -a "version" -d "Show version info"

# Agents for install/uninstall/list
complete -c osk -n "__fish_seen_subcommand_from install uninstall list" -a "claude antigravity codex cursor"

# Aliases
complete -c osk -n "__fish_use_subcommand" -a "i" -d "Install (alias)"
complete -c osk -n "__fish_use_subcommand" -a "rm" -d "Uninstall (alias)"
complete -c osk -n "__fish_use_subcommand" -a "ls" -d "List (alias)"
complete -c osk -n "__fish_use_subcommand" -a "up" -d "Update (alias)"
complete -c osk -n "__fish_use_subcommand" -a "s" -d "Search (alias)"
complete -c osk -n "__fish_use_subcommand" -a "b" -d "Browse (alias)"
complete -c osk -n "__fish_use_subcommand" -a "v" -d "Version (alias)"
`;

export const completionCommand = new Command("completion")
  .description("Generate shell completion script")
  .argument("[shell]", "Shell type (bash, zsh, fish)", "bash")
  .addHelpText(
    "after",
    `
Examples:
  $ osk completion bash >> ~/.bashrc
  $ osk completion zsh >> ~/.zshrc
  $ osk completion fish > ~/.config/fish/completions/osk.fish
`
  )
  .action((shell: string) => {
    switch (shell.toLowerCase()) {
      case "bash":
        logger.log(bashCompletion);
        break;
      case "zsh":
        logger.log(zshCompletion);
        break;
      case "fish":
        logger.log(fishCompletion);
        break;
      default:
        logger.error(`Invalid shell: ${shell}`);
        logger.dim("Supported shells: bash, zsh, fish");
        process.exit(1);
    }
  });
