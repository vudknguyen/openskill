import { Agent } from "./types.js";
import { claudeAgent } from "./claude.js";
import { antigravityAgent } from "./antigravity.js";
import { codexAgent } from "./codex.js";
import { cursorAgent } from "./cursor.js";

export const agents: Record<string, Agent> = {
  claude: claudeAgent,
  antigravity: antigravityAgent,
  codex: codexAgent,
  cursor: cursorAgent,
};

export function getAgent(name: string): Agent | undefined {
  return agents[name.toLowerCase()];
}

export function getAgentNames(): string[] {
  return Object.keys(agents);
}

export function getAllAgents(): Agent[] {
  return Object.values(agents);
}

export * from "./types.js";
export { claudeAgent } from "./claude.js";
export { antigravityAgent } from "./antigravity.js";
export { codexAgent } from "./codex.js";
export { cursorAgent } from "./cursor.js";
