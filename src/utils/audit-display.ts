import { logger } from "./logger.js";
import type { AuditFinding } from "../core/marketplace-client.js";

/** Strip ANSI escape sequences and control characters from server-provided strings. */
export function sanitize(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/[\x00-\x08\x0B-\x1F\x7F]|\x1b[\[\]PX^_][^\x07\x1b]*[\x07\x1b\\]?|\x1b[^[\]PX^_\x1b]/g, "");
}

export const severityConfig: Record<string, { icon: string; color: string }> = {
  critical: { icon: "✖", color: "\x1b[31m" },
  warning:  { icon: "⚠", color: "\x1b[33m" },
  info:     { icon: "ℹ", color: "\x1b[34m" },
};

export function displayFindings(findings: AuditFinding[], header?: string): void {
  if (header) {
    logger.log(`  ${header}`);
  }

  // Group by severity: critical → warning → info
  const order = ["critical", "warning", "info"] as const;
  const sorted = [...findings].sort(
    (a, b) => order.indexOf(a.severity) - order.indexOf(b.severity),
  );

  const MAX_DISPLAY = 20;
  const display = sorted.slice(0, MAX_DISPLAY);

  for (const f of display) {
    const cfg = severityConfig[f.severity] || severityConfig.warning;
    const ruleTag = `\x1b[2m[${sanitize(f.rule)}]\x1b[0m`;
    logger.log(`  ${cfg.color}${cfg.icon}\x1b[0m ${sanitize(f.message)} ${ruleTag}`);
    if (f.line > 0 && f.snippet) {
      logger.dim(`      Line ${f.line}: ${sanitize(f.snippet)}`);
    }
  }

  if (sorted.length > MAX_DISPLAY) {
    logger.dim(`  ... and ${sorted.length - MAX_DISPLAY} more findings`);
  }
}
