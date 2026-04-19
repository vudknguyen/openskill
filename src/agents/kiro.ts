import { BaseAgent } from "./base.js";

export const kiroAgent = new BaseAgent({
  name: "kiro",
  displayName: "Kiro",
  icon: "◈",
  color: "\x1b[36m", // Cyan
  defaultSkillPath: ".kiro/skills",
  globalDirName: ".kiro",
});
