import { BaseAgent } from "./base.js";

/**
 * OpenClaw: per-workspace skills/ directory (not under a dotted config dir),
 * or shared ~/.openclaw/skills/.
 */
export const openclawAgent = new BaseAgent({
  name: "openclaw",
  displayName: "OpenClaw",
  icon: "◎",
  color: "\x1b[38;5;208m", // Orange
  defaultSkillPath: "skills",
  globalDirName: ".openclaw",
});
