import { BaseAgent } from "./base.js";

export const opencodeAgent = new BaseAgent({
  name: "opencode",
  displayName: "OpenCode",
  icon: "◎",
  color: "\x1b[91m", // Bright red
  defaultSkillPath: ".opencode/skills",
  globalDirName: ".config/opencode",
});
