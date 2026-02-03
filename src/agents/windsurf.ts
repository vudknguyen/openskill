import { BaseAgent } from "./base.js";

export const windsurfAgent = new BaseAgent({
  name: "windsurf",
  displayName: "Windsurf",
  icon: "▲",
  color: "\x1b[92m", // Bright green
  defaultSkillPath: ".windsurf/skills",
  globalDirName: ".codeium/windsurf",
});
