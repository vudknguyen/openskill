import { BaseAgent } from "./base.js";

export const warpAgent = new BaseAgent({
  name: "warp",
  displayName: "Warp",
  icon: "⚡",
  color: "\x1b[33m", // Yellow
  defaultSkillPath: ".warp/skills",
  globalDirName: ".warp",
});
