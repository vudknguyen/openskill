import { BaseAgent } from "./base.js";

export const claudeAgent = new BaseAgent({
  name: "claude",
  displayName: "Claude Code",
  icon: "\u25c6",
  color: "\x1b[35m", // Magenta
  defaultSkillPath: ".claude/skills",
  globalDirName: ".claude",
});
