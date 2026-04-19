import { BaseAgent } from "./base.js";

export const geminiAgent = new BaseAgent({
  name: "gemini",
  displayName: "Gemini CLI",
  icon: "◇",
  color: "\x1b[34m", // Blue
  defaultSkillPath: ".gemini/skills",
  globalDirName: ".gemini",
});
