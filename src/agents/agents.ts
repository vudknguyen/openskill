import { BaseAgent } from "./base.js";

/**
 * Generic "agents" format — spec-compliant location used by multiple
 * frameworks that adopt the Agent Skills spec. Project: .agents/skills,
 * Global: ~/.agents/skills.
 */
export const agentsAgent = new BaseAgent({
  name: "agents",
  displayName: "Agents (generic)",
  icon: "◆",
  color: "\x1b[35m", // Magenta
  defaultSkillPath: ".agents/skills",
  globalDirName: ".agents",
});
