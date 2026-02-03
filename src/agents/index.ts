import { Agent } from "./types.js";
import { claudeAgent } from "./claude.js";
import { antigravityAgent } from "./antigravity.js";
import { codexAgent } from "./codex.js";
import { cursorAgent } from "./cursor.js";
import { geminiAgent } from "./gemini.js";
import { copilotAgent } from "./copilot.js";
import { opencodeAgent } from "./opencode.js";
import { windsurfAgent } from "./windsurf.js";

export const agents: Record<string, Agent> = {
  claude: claudeAgent,
  antigravity: antigravityAgent,
  codex: codexAgent,
  cursor: cursorAgent,
  gemini: geminiAgent,
  copilot: copilotAgent,
  opencode: opencodeAgent,
  windsurf: windsurfAgent,
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
export { geminiAgent } from "./gemini.js";
export { copilotAgent } from "./copilot.js";
export { opencodeAgent } from "./opencode.js";
export { windsurfAgent } from "./windsurf.js";
