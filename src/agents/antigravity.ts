import { BaseAgent } from "./base.js";

export const antigravityAgent = new BaseAgent({
  name: "antigravity",
  displayName: "Antigravity",
  icon: "\u25cf",
  color: "\x1b[36m", // Cyan
  defaultSkillPath: ".antigravity/skills",
  globalDirName: ".antigravity",
});
