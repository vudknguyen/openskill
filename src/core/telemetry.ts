import { existsSync, readFileSync, writeFileSync } from "fs";
import { createHash, randomBytes } from "crypto";
import { platform, arch, homedir } from "os";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { loadConfig, getConfigDir, ensureConfigDir } from "./config.js";

// ESM-compatible __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Inline version to avoid cross-layer dependency (core → cli)
function getCliVersion(): string {
  try {
    const pkgPath = join(__dirname, "../../package.json");
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
      return pkg.version || "unknown";
    }
  } catch {
    // Ignore errors
  }
  return "unknown";
}

/**
 * Telemetry event types matching the server-side enum.
 */
export type TelemetryEventType =
  | "skill_install"
  | "skill_uninstall"
  | "skill_update"
  | "cli_error"
  | "cli_start"
  | "cli_command";

/**
 * Telemetry event structure.
 */
export interface TelemetryEvent {
  eventType: TelemetryEventType;
  clientId: string;
  eventTimestamp: string;
  userId?: string;
  skillSlug?: string;
  skillVersion?: string;
  cliVersion?: string;
  platform?: string;
  arch?: string;
  errorMessage?: string;
  errorStack?: string;
  command?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Event queue for batching.
 */
interface EventQueue {
  events: TelemetryEvent[];
  lastFlushTime: number; // Unix timestamp of last successful flush
}

// Singleton telemetry client
let telemetryInstance: TelemetryClient | null = null;

/**
 * Get or create the telemetry client instance.
 */
export function getTelemetry(): TelemetryClient {
  if (!telemetryInstance) {
    telemetryInstance = new TelemetryClient();
  }
  return telemetryInstance;
}

/**
 * Reset the singleton instance (for testing).
 */
export function resetTelemetry(): void {
  telemetryInstance = null;
}

// Max size for metadata to prevent excessive data
const MAX_METADATA_SIZE = 1024;

// Sensitive patterns to redact from commands
const SENSITIVE_PATTERNS = [
  /--token[=\s]+\S+/gi,
  /--api-key[=\s]+\S+/gi,
  /--password[=\s]+\S+/gi,
  /--secret[=\s]+\S+/gi,
  /--key[=\s]+\S+/gi,
  /sk-[a-zA-Z0-9]+/g,
  /ghp_[a-zA-Z0-9]+/g,
  /gho_[a-zA-Z0-9]+/g,
];

/**
 * Telemetry client for tracking CLI usage.
 *
 * Features:
 * - Generates a hashed, anonymous client ID
 * - Batches events locally and sends in bulk
 * - Non-blocking - failures don't affect CLI operation
 * - Respects user privacy with opt-out support
 */
export class TelemetryClient {
  private clientId: string;
  private queue: TelemetryEvent[] = [];
  private readonly maxQueueSize = 20;
  private readonly flushIntervalMs = 5 * 60 * 1000; // 5 minutes
  private enabled: boolean = true;
  private lastFlushTime: number = 0;
  private homeDir: string;

  constructor() {
    this.homeDir = homedir();
    this.clientId = this.getOrCreateClientId();
    this.enabled = this.isEnabled();
    this.loadQueueFromDisk();
  }

  /**
   * Check if telemetry is enabled.
   * Checks config setting first, then env variables as override.
   * Disabled by default - user must opt-in via config.
   */
  private isEnabled(): boolean {
    // Environment variables can force opt-out
    const optOut = process.env.OPENSKILL_TELEMETRY_OPTOUT;
    const doNotTrack = process.env.DO_NOT_TRACK;
    if (optOut === "1" || optOut === "true" || doNotTrack === "1" || doNotTrack === "true") {
      return false;
    }

    // Check config setting (default is true/opt-in)
    const config = loadConfig();
    return config.telemetryEnabled !== false;
  }

  /**
   * Get path to client ID file.
   */
  private getClientIdPath(): string {
    return join(getConfigDir(), ".telemetry-id");
  }

  /**
   * Get path to event queue file.
   */
  private getQueuePath(): string {
    return join(getConfigDir(), ".telemetry-queue.json");
  }

  /**
   * Generate or load the anonymous client ID.
   * Uses only random bytes for true anonymity.
   */
  private getOrCreateClientId(): string {
    ensureConfigDir();
    const idPath = this.getClientIdPath();

    if (existsSync(idPath)) {
      try {
        const id = readFileSync(idPath, "utf-8").trim();
        if (id.length === 64 && /^[a-f0-9]+$/.test(id)) {
          return id;
        }
      } catch {
        // Fall through to generate new ID
      }
    }

    // Generate new anonymous client ID using only random bytes
    const randomData = randomBytes(32);
    const hash = createHash("sha256")
      .update(randomData)
      .digest("hex");

    try {
      // Write with secure permissions (owner read/write only)
      writeFileSync(idPath, hash, { encoding: "utf-8", mode: 0o600 });
    } catch {
      // If we can't persist, that's okay - we'll generate a new one next time
    }

    return hash;
  }

  /**
   * Load pending events from disk.
   */
  private loadQueueFromDisk(): void {
    const queuePath = this.getQueuePath();
    if (!existsSync(queuePath)) return;

    try {
      const data = readFileSync(queuePath, "utf-8");
      const parsed = JSON.parse(data) as EventQueue;
      // Limit queue size when loading to prevent memory issues
      this.queue = (parsed.events || []).slice(0, this.maxQueueSize);
      this.lastFlushTime = parsed.lastFlushTime || 0;

      // Check if we should auto-flush based on time
      const now = Date.now();
      if (this.lastFlushTime > 0 && now - this.lastFlushTime > this.flushIntervalMs) {
        this.flush().catch(() => {});
      }
    } catch {
      this.queue = [];
    }
  }

  /**
   * Save pending events to disk (does NOT update lastFlushTime).
   */
  private saveQueueToDisk(): void {
    const queuePath = this.getQueuePath();
    const data: EventQueue = {
      events: this.queue,
      lastFlushTime: this.lastFlushTime,
    };

    try {
      writeFileSync(queuePath, JSON.stringify(data), { encoding: "utf-8", mode: 0o600 });
    } catch {
      // Ignore write errors
    }
  }

  /**
   * Clear the queue from disk and update lastFlushTime.
   */
  private markFlushed(): void {
    this.lastFlushTime = Date.now();
    const queuePath = this.getQueuePath();
    const data: EventQueue = {
      events: [],
      lastFlushTime: this.lastFlushTime,
    };
    try {
      writeFileSync(queuePath, JSON.stringify(data), { encoding: "utf-8", mode: 0o600 });
    } catch {
      // Ignore write errors
    }
  }

  /**
   * Sanitize error stack to remove sensitive paths.
   */
  private sanitizeStack(stack: string | undefined): string | undefined {
    if (!stack) return undefined;
    // Remove home directory from paths
    let sanitized = stack.replace(new RegExp(this.homeDir, "g"), "~");
    // Truncate to reasonable length
    return sanitized.slice(0, 2000);
  }

  /**
   * Sanitize command string to remove sensitive arguments.
   */
  private sanitizeCommand(command: string | undefined): string | undefined {
    if (!command) return undefined;
    let sanitized = command;
    for (const pattern of SENSITIVE_PATTERNS) {
      sanitized = sanitized.replace(pattern, "[REDACTED]");
    }
    return sanitized.slice(0, 100);
  }

  /**
   * Sanitize and limit metadata size.
   */
  private sanitizeMetadata(metadata: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
    if (!metadata) return undefined;
    const str = JSON.stringify(metadata);
    if (str.length > MAX_METADATA_SIZE) {
      // Return only first-level keys with truncated values
      const limited: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(metadata)) {
        if (typeof value === "string") {
          limited[key] = value.slice(0, 100);
        } else if (typeof value === "number" || typeof value === "boolean") {
          limited[key] = value;
        } else {
          limited[key] = "[truncated]";
        }
      }
      return limited;
    }
    return metadata;
  }

  /**
   * Create a base event with common fields populated.
   */
  private createBaseEvent(type: TelemetryEventType): TelemetryEvent {
    return {
      eventType: type,
      clientId: this.clientId,
      eventTimestamp: new Date().toISOString(),
      cliVersion: getCliVersion(),
      platform: platform(),
      arch: arch(),
    };
  }

  /**
   * Queue an event for later sending.
   */
  private queueEvent(event: TelemetryEvent): void {
    if (!this.enabled) return;

    this.queue.push(event);
    this.saveQueueToDisk();

    // Auto-flush if queue is full
    if (this.queue.length >= this.maxQueueSize) {
      this.flush().catch(() => {});
    }
  }

  // ==================== Public Tracking Methods ====================

  /**
   * Track a skill installation.
   */
  trackInstall(skillSlug: string, skillVersion?: string, metadata?: Record<string, unknown>): void {
    const event = this.createBaseEvent("skill_install");
    event.skillSlug = skillSlug;
    event.skillVersion = skillVersion;
    event.metadata = this.sanitizeMetadata(metadata);
    this.queueEvent(event);
  }

  /**
   * Track a skill uninstallation.
   */
  trackUninstall(skillSlug: string, metadata?: Record<string, unknown>): void {
    const event = this.createBaseEvent("skill_uninstall");
    event.skillSlug = skillSlug;
    event.metadata = this.sanitizeMetadata(metadata);
    this.queueEvent(event);
  }

  /**
   * Track a skill update.
   */
  trackUpdate(skillSlug: string, fromVersion?: string, toVersion?: string): void {
    const event = this.createBaseEvent("skill_update");
    event.skillSlug = skillSlug;
    event.skillVersion = toVersion;
    event.metadata = { fromVersion, toVersion };
    this.queueEvent(event);
  }

  /**
   * Track a CLI error.
   */
  trackError(error: Error, command?: string): void {
    const event = this.createBaseEvent("cli_error");
    event.errorMessage = error.message.slice(0, 2000);
    event.errorStack = this.sanitizeStack(error.stack);
    event.command = this.sanitizeCommand(command);
    this.queueEvent(event);
  }

  /**
   * Track CLI startup.
   */
  trackStart(): void {
    const event = this.createBaseEvent("cli_start");
    this.queueEvent(event);
  }

  /**
   * Track a CLI command execution.
   */
  trackCommand(command: string, metadata?: Record<string, unknown>): void {
    const event = this.createBaseEvent("cli_command");
    event.command = this.sanitizeCommand(command);
    event.metadata = this.sanitizeMetadata(metadata);
    this.queueEvent(event);
  }

  // ==================== Flush Methods ====================

  /**
   * Send all queued events to the server.
   * This is fire-and-forget - failures are silently ignored.
   */
  async flush(): Promise<void> {
    if (!this.enabled || this.queue.length === 0) return;

    const eventsToSend = [...this.queue];
    this.queue = [];

    // Read server URL at flush time for config reactivity
    const config = loadConfig();
    const serverUrl = config.serverUrl;

    try {
      const response = await fetch(`${serverUrl}/api/telemetry`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ events: eventsToSend }),
        signal: AbortSignal.timeout(5000), // 5 second timeout
      });

      if (response.ok) {
        // Success - update last flush time
        this.markFlushed();
      } else {
        // Re-queue events on failure, keeping newest (LIFO)
        const toRequeue = eventsToSend.slice(-this.maxQueueSize);
        this.queue = toRequeue;
        this.saveQueueToDisk();
      }
    } catch {
      // Re-queue events on network error, keeping newest (LIFO)
      const toRequeue = eventsToSend.slice(-this.maxQueueSize);
      this.queue = toRequeue;
      this.saveQueueToDisk();
    }
  }

  /**
   * Flush events in the background (non-blocking).
   * Use this at the end of CLI commands.
   */
  flushAsync(): void {
    if (!this.enabled || this.queue.length === 0) return;
    // Fire and forget - don't await
    this.flush().catch(() => {});
  }
}

// ==================== Convenience Functions ====================

/**
 * Track a skill installation.
 */
export function trackInstall(skillSlug: string, skillVersion?: string, metadata?: Record<string, unknown>): void {
  getTelemetry().trackInstall(skillSlug, skillVersion, metadata);
}

/**
 * Track a skill uninstallation.
 */
export function trackUninstall(skillSlug: string, metadata?: Record<string, unknown>): void {
  getTelemetry().trackUninstall(skillSlug, metadata);
}

/**
 * Track a skill update.
 */
export function trackUpdate(skillSlug: string, fromVersion?: string, toVersion?: string): void {
  getTelemetry().trackUpdate(skillSlug, fromVersion, toVersion);
}

/**
 * Track a CLI error.
 */
export function trackError(error: Error, command?: string): void {
  getTelemetry().trackError(error, command);
}

/**
 * Track CLI startup.
 */
export function trackStart(): void {
  getTelemetry().trackStart();
}

/**
 * Track a CLI command execution.
 */
export function trackCommand(command: string, metadata?: Record<string, unknown>): void {
  getTelemetry().trackCommand(command, metadata);
}

/**
 * Flush telemetry events in background.
 */
export function flushTelemetry(): void {
  getTelemetry().flushAsync();
}
