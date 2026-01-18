import { BaseAgent } from "./base.js";

export const cursorAgent = new BaseAgent({
  name: "cursor",
  displayName: "Cursor",
  icon: "\u25b8",
  color: "\x1b[33m", // Yellow
  defaultSkillPath: ".cursor/skills",
  globalDirName: ".cursor",
});
