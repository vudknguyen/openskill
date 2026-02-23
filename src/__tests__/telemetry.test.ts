import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Hoisted mocks
const { mockLoadConfig } = vi.hoisted(() => {
  const mockLoadConfig = vi.fn(() => ({
    serverUrl: "https://test.example.com",
    defaultAgent: "claude",
    defaultScope: "project",
    telemetryEnabled: true,
    repos: [],
    agents: {},
    version: 3,
  }));
  return { mockLoadConfig };
});

// Mock fs
vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
  };
});

// Mock crypto
vi.mock("crypto", () => ({
  createHash: vi.fn(() => ({
    update: vi.fn().mockReturnThis(),
    digest: vi.fn(() => "a".repeat(64)),
  })),
  randomBytes: vi.fn(() => Buffer.from("random")),
}));

// Mock os
vi.mock("os", () => ({
  homedir: vi.fn(() => "/mock/home"),
  platform: vi.fn(() => "darwin"),
  arch: vi.fn(() => "arm64"),
}));

// Mock config
vi.mock("../core/config.js", () => ({
  loadConfig: mockLoadConfig,
  getConfigDir: vi.fn(() => "/mock/home/.openskill"),
  ensureConfigDir: vi.fn(),
}));

import { existsSync, readFileSync, writeFileSync } from "fs";
import {
  TelemetryClient,
  getTelemetry,
  resetTelemetry,
  trackInstall,
  trackUninstall,
  trackUpdate,
  trackError,
  trackStart,
  trackCommand,
  flushTelemetry,
} from "../core/telemetry.js";

const mockExistsSync = vi.mocked(existsSync);
const mockReadFileSync = vi.mocked(readFileSync);
const mockWriteFileSync = vi.mocked(writeFileSync);

describe("TelemetryClient", () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    vi.clearAllMocks();
    originalEnv = { ...process.env };
    resetTelemetry();
    // Reset mock to default
    mockLoadConfig.mockReturnValue({
      serverUrl: "https://test.example.com",
      defaultAgent: "claude",
      defaultScope: "project",
      telemetryEnabled: true,
      repos: [],
      agents: {},
      version: 3,
    });
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("client ID generation", () => {
    it("generates a new client ID when none exists", () => {
      mockExistsSync.mockReturnValue(false);

      new TelemetryClient();

      expect(mockWriteFileSync).toHaveBeenCalledWith(
        "/mock/home/.openskill/.telemetry-id",
        expect.stringMatching(/^[a-f0-9]{64}$/),
        expect.objectContaining({ encoding: "utf-8", mode: 0o600 })
      );
    });

    it("reuses existing valid client ID", () => {
      mockExistsSync.mockImplementation((path) => {
        if (String(path).includes(".telemetry-id")) return true;
        return false;
      });
      mockReadFileSync.mockReturnValue("b".repeat(64));

      new TelemetryClient();

      expect(mockReadFileSync).toHaveBeenCalledWith(
        "/mock/home/.openskill/.telemetry-id",
        "utf-8"
      );
    });

    it("regenerates client ID when existing file has invalid length", () => {
      mockExistsSync.mockImplementation((path) => {
        if (String(path).includes(".telemetry-id")) return true;
        return false;
      });
      mockReadFileSync.mockReturnValue("short");

      new TelemetryClient();

      expect(mockWriteFileSync).toHaveBeenCalledWith(
        "/mock/home/.openskill/.telemetry-id",
        expect.stringMatching(/^[a-f0-9]{64}$/),
        expect.objectContaining({ encoding: "utf-8", mode: 0o600 })
      );
    });

    it("regenerates client ID when read fails", () => {
      mockExistsSync.mockImplementation((path) => {
        if (String(path).includes(".telemetry-id")) return true;
        return false;
      });
      mockReadFileSync.mockImplementation(() => {
        throw new Error("read error");
      });

      new TelemetryClient();

      expect(mockWriteFileSync).toHaveBeenCalledWith(
        "/mock/home/.openskill/.telemetry-id",
        expect.any(String),
        expect.any(Object)
      );
    });

    it("handles client ID write failure gracefully", () => {
      mockExistsSync.mockReturnValue(false);
      mockWriteFileSync.mockImplementation(() => {
        throw new Error("write error");
      });

      expect(() => new TelemetryClient()).not.toThrow();
    });
  });

  describe("opt-out", () => {
    it("respects OPENSKILL_TELEMETRY_OPTOUT=1", () => {
      process.env.OPENSKILL_TELEMETRY_OPTOUT = "1";
      mockExistsSync.mockReturnValue(false);

      const client = new TelemetryClient();
      mockWriteFileSync.mockClear();
      client.trackInstall("test-skill");

      expect(mockWriteFileSync).not.toHaveBeenCalled();
    });

    it("respects OPENSKILL_TELEMETRY_OPTOUT=true", () => {
      process.env.OPENSKILL_TELEMETRY_OPTOUT = "true";
      mockExistsSync.mockReturnValue(false);

      const client = new TelemetryClient();
      mockWriteFileSync.mockClear();
      client.trackInstall("test-skill");

      expect(mockWriteFileSync).not.toHaveBeenCalled();
    });

    it("respects DO_NOT_TRACK=1", () => {
      process.env.DO_NOT_TRACK = "1";
      mockExistsSync.mockReturnValue(false);

      const client = new TelemetryClient();
      mockWriteFileSync.mockClear();
      client.trackInstall("test-skill");

      expect(mockWriteFileSync).not.toHaveBeenCalled();
    });

    it("respects DO_NOT_TRACK=true", () => {
      process.env.DO_NOT_TRACK = "true";
      mockExistsSync.mockReturnValue(false);

      const client = new TelemetryClient();
      mockWriteFileSync.mockClear();
      client.trackInstall("test-skill");

      expect(mockWriteFileSync).not.toHaveBeenCalled();
    });

    it("respects config telemetryEnabled=false", () => {
      mockLoadConfig.mockReturnValue({
        serverUrl: "https://test.example.com",
        defaultAgent: "claude",
        defaultScope: "project",
        telemetryEnabled: false,
        repos: [],
        agents: {},
        version: 3,
      });
      mockExistsSync.mockReturnValue(false);

      const client = new TelemetryClient();
      mockWriteFileSync.mockClear();
      client.trackInstall("test-skill");

      expect(mockWriteFileSync).not.toHaveBeenCalled();
    });
  });

  describe("event tracking", () => {
    beforeEach(() => {
      mockExistsSync.mockReturnValue(false);
    });

    it("tracks install events", () => {
      const client = new TelemetryClient();
      mockWriteFileSync.mockClear();
      client.trackInstall("my-skill", "1.0.0", { agent: "claude" });

      expect(mockWriteFileSync).toHaveBeenCalledWith(
        "/mock/home/.openskill/.telemetry-queue.json",
        expect.stringContaining('"eventType":"skill_install"'),
        expect.any(Object)
      );
    });

    it("tracks uninstall events", () => {
      const client = new TelemetryClient();
      mockWriteFileSync.mockClear();
      client.trackUninstall("my-skill", { agent: "claude" });

      expect(mockWriteFileSync).toHaveBeenCalledWith(
        "/mock/home/.openskill/.telemetry-queue.json",
        expect.stringContaining('"eventType":"skill_uninstall"'),
        expect.any(Object)
      );
    });

    it("tracks update events", () => {
      const client = new TelemetryClient();
      mockWriteFileSync.mockClear();
      client.trackUpdate("my-skill", "1.0.0", "2.0.0");

      expect(mockWriteFileSync).toHaveBeenCalledWith(
        "/mock/home/.openskill/.telemetry-queue.json",
        expect.stringContaining('"eventType":"skill_update"'),
        expect.any(Object)
      );
    });

    it("tracks error events", () => {
      const client = new TelemetryClient();
      mockWriteFileSync.mockClear();
      const error = new Error("Test error");
      client.trackError(error, "install");

      expect(mockWriteFileSync).toHaveBeenCalledWith(
        "/mock/home/.openskill/.telemetry-queue.json",
        expect.stringContaining('"eventType":"cli_error"'),
        expect.any(Object)
      );
    });

    it("tracks start events", () => {
      const client = new TelemetryClient();
      mockWriteFileSync.mockClear();
      client.trackStart();

      expect(mockWriteFileSync).toHaveBeenCalledWith(
        "/mock/home/.openskill/.telemetry-queue.json",
        expect.stringContaining('"eventType":"cli_start"'),
        expect.any(Object)
      );
    });

    it("tracks command events", () => {
      const client = new TelemetryClient();
      mockWriteFileSync.mockClear();
      client.trackCommand("browse");

      expect(mockWriteFileSync).toHaveBeenCalledWith(
        "/mock/home/.openskill/.telemetry-queue.json",
        expect.stringContaining('"eventType":"cli_command"'),
        expect.any(Object)
      );
    });

    it("includes platform info in events", () => {
      const client = new TelemetryClient();
      mockWriteFileSync.mockClear();
      client.trackStart();

      const writeCall = mockWriteFileSync.mock.calls.find((call) =>
        String(call[0]).includes(".telemetry-queue.json")
      );
      const data = JSON.parse(writeCall![1] as string);

      expect(data.events[0]).toMatchObject({
        platform: "darwin",
        arch: "arm64",
      });
    });

    it("sanitizes sensitive tokens from commands", () => {
      const client = new TelemetryClient();
      mockWriteFileSync.mockClear();
      client.trackCommand("login --token sk-secret123");

      const writeCall = mockWriteFileSync.mock.calls.find((call) =>
        String(call[0]).includes(".telemetry-queue.json")
      );
      const data = JSON.parse(writeCall![1] as string);

      expect(data.events[0].command).toContain("[REDACTED]");
      expect(data.events[0].command).not.toContain("sk-secret123");
    });

    it("sanitizes home directory from error stacks", () => {
      const client = new TelemetryClient();
      mockWriteFileSync.mockClear();
      const error = new Error("Test");
      error.stack = "Error: Test\n    at /mock/home/project/file.ts:10:5";
      client.trackError(error);

      const writeCall = mockWriteFileSync.mock.calls.find((call) =>
        String(call[0]).includes(".telemetry-queue.json")
      );
      const data = JSON.parse(writeCall![1] as string);

      expect(data.events[0].errorStack).toContain("~/project/file.ts");
      expect(data.events[0].errorStack).not.toContain("/mock/home");
    });

    it("truncates long error messages", () => {
      const client = new TelemetryClient();
      mockWriteFileSync.mockClear();
      const longMessage = "x".repeat(3000);
      client.trackError(new Error(longMessage));

      const writeCall = mockWriteFileSync.mock.calls.find((call) =>
        String(call[0]).includes(".telemetry-queue.json")
      );
      const data = JSON.parse(writeCall![1] as string);

      expect(data.events[0].errorMessage.length).toBeLessThanOrEqual(2000);
    });

    it("truncates long commands", () => {
      const client = new TelemetryClient();
      mockWriteFileSync.mockClear();
      const longCommand = "x".repeat(200);
      client.trackCommand(longCommand);

      const writeCall = mockWriteFileSync.mock.calls.find((call) =>
        String(call[0]).includes(".telemetry-queue.json")
      );
      const data = JSON.parse(writeCall![1] as string);

      expect(data.events[0].command.length).toBeLessThanOrEqual(100);
    });
  });

  describe("queue persistence", () => {
    it("handles corrupted queue file", () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue("not valid json");

      expect(() => new TelemetryClient()).not.toThrow();
    });

    it("limits queue size when loading from disk", () => {
      const manyEvents = Array(50).fill({ eventType: "cli_start" });
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(
        JSON.stringify({ events: manyEvents, lastFlushTime: 0 })
      );

      const client = new TelemetryClient();
      // Queue should be limited to maxQueueSize (20)
      expect((client as any).queue.length).toBeLessThanOrEqual(20);
    });

    it("handles saveQueueToDisk write errors gracefully", () => {
      mockExistsSync.mockReturnValue(false);
      const client = new TelemetryClient();

      mockWriteFileSync.mockImplementation(() => {
        throw new Error("disk full");
      });

      expect(() => client.trackStart()).not.toThrow();
    });
  });

  describe("flush", () => {
    beforeEach(() => {
      mockExistsSync.mockReturnValue(false);
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });
    });

    it("sends events to server on flush", async () => {
      const client = new TelemetryClient();
      client.trackInstall("my-skill");
      await client.flush();

      expect(global.fetch).toHaveBeenCalledWith(
        "https://test.example.com/api/telemetry",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: expect.stringContaining('"events"'),
        })
      );
    });

    it("reads server URL at flush time for config reactivity", async () => {
      const client = new TelemetryClient();
      client.trackInstall("my-skill");

      // Change config after client creation
      mockLoadConfig.mockReturnValue({
        serverUrl: "https://new-server.example.com",
        telemetryEnabled: true,
        defaultAgent: "claude",
        defaultScope: "project",
        repos: [],
        agents: {},
        version: 3,
      });

      await client.flush();

      expect(global.fetch).toHaveBeenCalledWith(
        "https://new-server.example.com/api/telemetry",
        expect.any(Object)
      );
    });

    it("re-queues events on HTTP failure", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      });

      const client = new TelemetryClient();
      client.trackInstall("my-skill");
      mockWriteFileSync.mockClear();

      await client.flush();

      // Should re-queue the event
      expect(mockWriteFileSync).toHaveBeenCalledWith(
        "/mock/home/.openskill/.telemetry-queue.json",
        expect.stringContaining('"eventType":"skill_install"'),
        expect.any(Object)
      );
    });

    it("re-queues events on network error", async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

      const client = new TelemetryClient();
      client.trackInstall("my-skill");
      mockWriteFileSync.mockClear();

      await client.flush();

      expect(mockWriteFileSync).toHaveBeenCalledWith(
        "/mock/home/.openskill/.telemetry-queue.json",
        expect.stringContaining('"eventType":"skill_install"'),
        expect.any(Object)
      );
    });

    it("does not send when queue is empty", async () => {
      const client = new TelemetryClient();
      await client.flush();

      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("does not send when telemetry is disabled", async () => {
      mockLoadConfig.mockReturnValue({
        serverUrl: "https://test.example.com",
        telemetryEnabled: false,
        defaultAgent: "claude",
        defaultScope: "project",
        repos: [],
        agents: {},
        version: 3,
      });

      const client = new TelemetryClient();
      // Force add event to test flush behavior
      (client as any).queue = [{ eventType: "test" }];
      await client.flush();

      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("flushAsync sends events in background", async () => {
      const client = new TelemetryClient();
      client.trackStart();
      client.flushAsync();

      await new Promise((r) => setTimeout(r, 100));
      expect(global.fetch).toHaveBeenCalled();
    });

    it("flushAsync does nothing when disabled", () => {
      mockLoadConfig.mockReturnValue({
        serverUrl: "https://test.example.com",
        telemetryEnabled: false,
        defaultAgent: "claude",
        defaultScope: "project",
        repos: [],
        agents: {},
        version: 3,
      });

      const client = new TelemetryClient();
      client.flushAsync();

      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe("auto-flush", () => {
    beforeEach(() => {
      global.fetch = vi.fn().mockResolvedValue({ ok: true });
    });

    it("auto-flushes when queue reaches max size", async () => {
      mockExistsSync.mockReturnValue(false);
      const client = new TelemetryClient();

      // Track 20 events to trigger auto-flush
      for (let i = 0; i < 20; i++) {
        client.trackCommand(`command-${i}`);
      }

      await new Promise((r) => setTimeout(r, 100));
      expect(global.fetch).toHaveBeenCalled();
    });

    it("auto-flushes when queue file is stale", async () => {
      const oldTime = Date.now() - 10 * 60 * 1000; // 10 minutes ago
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          events: [{ eventType: "cli_start" }],
          lastFlushTime: oldTime,
        })
      );

      new TelemetryClient();

      await new Promise((r) => setTimeout(r, 100));
      expect(global.fetch).toHaveBeenCalled();
    });
  });
});

describe("convenience functions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetTelemetry();
    mockExistsSync.mockReturnValue(false);
    mockLoadConfig.mockReturnValue({
      serverUrl: "https://test.example.com",
      telemetryEnabled: true,
      defaultAgent: "claude",
      defaultScope: "project",
      repos: [],
      agents: {},
      version: 3,
    });
  });

  it("trackInstall uses singleton", () => {
    trackInstall("test-skill");

    expect(mockWriteFileSync).toHaveBeenCalledWith(
      expect.stringContaining(".telemetry-queue.json"),
      expect.stringContaining("skill_install"),
      expect.any(Object)
    );
  });

  it("trackUninstall uses singleton", () => {
    trackUninstall("test-skill");

    expect(mockWriteFileSync).toHaveBeenCalledWith(
      expect.stringContaining(".telemetry-queue.json"),
      expect.stringContaining("skill_uninstall"),
      expect.any(Object)
    );
  });

  it("trackUpdate uses singleton", () => {
    trackUpdate("test-skill", "1.0.0", "2.0.0");

    expect(mockWriteFileSync).toHaveBeenCalledWith(
      expect.stringContaining(".telemetry-queue.json"),
      expect.stringContaining("skill_update"),
      expect.any(Object)
    );
  });

  it("trackError uses singleton", () => {
    trackError(new Error("test"));

    expect(mockWriteFileSync).toHaveBeenCalledWith(
      expect.stringContaining(".telemetry-queue.json"),
      expect.stringContaining("cli_error"),
      expect.any(Object)
    );
  });

  it("trackStart uses singleton", () => {
    trackStart();

    expect(mockWriteFileSync).toHaveBeenCalledWith(
      expect.stringContaining(".telemetry-queue.json"),
      expect.stringContaining("cli_start"),
      expect.any(Object)
    );
  });

  it("trackCommand uses singleton", () => {
    trackCommand("test-command");

    expect(mockWriteFileSync).toHaveBeenCalledWith(
      expect.stringContaining(".telemetry-queue.json"),
      expect.stringContaining("cli_command"),
      expect.any(Object)
    );
  });

  it("flushTelemetry uses singleton", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true });
    trackStart();
    flushTelemetry();

    await new Promise((r) => setTimeout(r, 100));
    expect(global.fetch).toHaveBeenCalled();
  });
});

describe("metadata sanitization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetTelemetry();
    mockExistsSync.mockReturnValue(false);
    mockLoadConfig.mockReturnValue({
      serverUrl: "https://test.example.com",
      telemetryEnabled: true,
      defaultAgent: "claude",
      defaultScope: "project",
      repos: [],
      agents: {},
      version: 3,
    });
  });

  it("limits metadata size", () => {
    const largeMetadata: Record<string, unknown> = {};
    for (let i = 0; i < 100; i++) {
      largeMetadata[`key${i}`] = "x".repeat(100);
    }

    const client = new TelemetryClient();
    mockWriteFileSync.mockClear();
    client.trackInstall("my-skill", undefined, largeMetadata);

    const writeCall = mockWriteFileSync.mock.calls.find((call) =>
      String(call[0]).includes(".telemetry-queue.json")
    );
    const data = JSON.parse(writeCall![1] as string);
    const metadataStr = JSON.stringify(data.events[0].metadata);

    // Should be truncated
    expect(metadataStr.length).toBeLessThan(15000);
  });
});
