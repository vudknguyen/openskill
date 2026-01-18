import { BaseAgent } from "./base.js";

export const codexAgent = new BaseAgent({
  name: "codex",
  displayName: "OpenAI Codex",
  icon: "\u25cb",
  color: "\x1b[32m", // Green
  defaultSkillPath: ".codex/skills",
  globalDirName: ".codex",
});
