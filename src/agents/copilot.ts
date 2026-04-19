import { BaseAgent } from "./base.js";

export const copilotAgent = new BaseAgent({
  name: "copilot",
  displayName: "GitHub Copilot",
  icon: "■",
  color: "\x1b[37m", // White
  defaultSkillPath: ".github/skills",
  globalDirName: ".copilot",
});
