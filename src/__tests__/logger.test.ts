import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Store original stdout/console methods
const originalStdoutWrite = process.stdout.write;
const originalStdoutIsTTY = process.stdout.isTTY;
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

describe("logger", () => {
  let logOutput: string[];
  let errorOutput: string[];

  beforeEach(async () => {
    logOutput = [];
    errorOutput = [];

    // Reset module cache to get fresh logger instance
    vi.resetModules();

    // Mock console methods
    console.log = vi.fn((...args) => {
      logOutput.push(args.map(String).join(" "));
    });
    console.error = vi.fn((...args) => {
      errorOutput.push(args.map(String).join(" "));
    });

    // Mock stdout.write for spinner tests
    (process.stdout as { write: typeof process.stdout.write }).write = vi.fn(
      (text: string | Uint8Array) => {
        if (typeof text === "string") {
          logOutput.push(text);
        }
        return true;
      }
    );
  });

  afterEach(() => {
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
    (process.stdout as { write: typeof process.stdout.write }).write = originalStdoutWrite;
    Object.defineProperty(process.stdout, "isTTY", { value: originalStdoutIsTTY });
    vi.useRealTimers();
  });

  describe("basic logging", () => {
    it("logs plain messages", async () => {
      const { logger } = await import("../utils/logger.js");

      logger.log("Hello world");

      expect(logOutput).toContainEqual(expect.stringContaining("Hello world"));
    });

    it("logs info messages with icon", async () => {
      const { logger } = await import("../utils/logger.js");

      logger.info("Info message");

      const output = logOutput.join(" ");
      expect(output).toContain("ℹ");
      expect(output).toContain("Info message");
    });

    it("logs success messages with icon", async () => {
      const { logger } = await import("../utils/logger.js");

      logger.success("Success message");

      const output = logOutput.join(" ");
      expect(output).toContain("✔");
      expect(output).toContain("Success message");
    });

    it("logs warning messages with icon", async () => {
      const { logger } = await import("../utils/logger.js");

      logger.warn("Warning message");

      const output = logOutput.join(" ");
      expect(output).toContain("⚠");
      expect(output).toContain("Warning message");
    });

    it("logs error messages with icon", async () => {
      const { logger } = await import("../utils/logger.js");

      logger.error("Error message");

      const output = logOutput.join(" ");
      expect(output).toContain("✖");
      expect(output).toContain("Error message");
    });

    it("logs dim messages", async () => {
      const { logger } = await import("../utils/logger.js");

      logger.dim("Dim message");

      // Dim uses ANSI codes
      expect(logOutput.some((line) => line.includes("Dim message"))).toBe(true);
    });

    it("logs newlines", async () => {
      const { logger } = await import("../utils/logger.js");

      logger.newline();

      // console.log called with no args produces empty line
      expect(console.log).toHaveBeenCalled();
    });
  });

  describe("rawError", () => {
    it("outputs to stderr", async () => {
      const { logger } = await import("../utils/logger.js");
      const error = new Error("Test error");

      logger.rawError(error);

      expect(errorOutput.some((line) => line.includes("Test error"))).toBe(true);
    });
  });

  describe("cancelled", () => {
    it("outputs cancellation message", async () => {
      const { logger } = await import("../utils/logger.js");

      logger.cancelled();

      expect(logOutput.some((line) => line.includes("Operation cancelled"))).toBe(true);
    });
  });

  describe("skill display", () => {
    it("displays skill with name and description", async () => {
      const { logger } = await import("../utils/logger.js");

      logger.skill("my-skill", "A cool skill");

      const output = logOutput.join("\n");
      expect(output).toContain("my-skill");
      expect(output).toContain("A cool skill");
    });

    it("displays skill without description", async () => {
      const { logger } = await import("../utils/logger.js");

      logger.skill("my-skill");

      const output = logOutput.join("\n");
      expect(output).toContain("my-skill");
    });

    it("displays compact skill format", async () => {
      const { logger } = await import("../utils/logger.js");

      logger.skillCompact("my-skill", "v1.0.0", "🤖", "\x1b[34m", "global");

      const output = logOutput.join(" ");
      expect(output).toContain("my-skill");
      expect(output).toContain("v1.0.0");
      expect(output).toContain("[G]");
    });
  });

  describe("header", () => {
    it("displays header with formatting", async () => {
      const { logger } = await import("../utils/logger.js");

      logger.header("My Header");

      const output = logOutput.join("\n");
      expect(output).toContain("My Header");
    });
  });

  describe("table", () => {
    it("displays table with headers and rows", async () => {
      const { logger } = await import("../utils/logger.js");

      logger.table(
        [
          { name: "Alice", age: "30" },
          { name: "Bob", age: "25" },
        ],
        ["name", "age"]
      );

      const output = logOutput.join("\n");
      expect(output).toContain("name");
      expect(output).toContain("age");
      expect(output).toContain("Alice");
      expect(output).toContain("Bob");
      expect(output).toContain("─"); // Separator line
    });

    it("handles empty rows", async () => {
      const { logger } = await import("../utils/logger.js");

      logger.table([], ["name", "age"]);

      // Should not output anything for empty table
      expect(logOutput.length).toBe(0);
    });
  });
});

describe("createSpinner", () => {
  let logOutput: string[];

  beforeEach(async () => {
    logOutput = [];
    vi.resetModules();
    vi.useFakeTimers();

    console.log = vi.fn((...args) => {
      logOutput.push(args.map(String).join(" "));
    });

    (process.stdout as { write: typeof process.stdout.write }).write = vi.fn(
      (text: string | Uint8Array) => {
        if (typeof text === "string") {
          logOutput.push(text);
        }
        return true;
      }
    );

    (process.stdout as { clearLine: (dir: number) => void }).clearLine = vi.fn(() => {});

    (process.stdout as { cursorTo: (pos: number) => void }).cursorTo = vi.fn(() => {});
  });

  afterEach(() => {
    console.log = originalConsoleLog;
    (process.stdout as { write: typeof process.stdout.write }).write = originalStdoutWrite;
    vi.useRealTimers();
  });

  // Note: We test spinner behavior based on actual TTY state
  // since process.stdout.isTTY is not configurable at runtime

  it("creates spinner and can stop it", async () => {
    const { createSpinner } = await import("../utils/logger.js");
    const spinner = createSpinner("Loading...");

    // Advance timers
    vi.advanceTimersByTime(160);

    spinner.stop("Done");

    // Should have logged something (either spinner or simple message)
    expect(logOutput.length).toBeGreaterThan(0);
  });

  it("allows updating spinner message", async () => {
    const { createSpinner } = await import("../utils/logger.js");
    const spinner = createSpinner("Initial message");

    spinner.update("Updated message");
    vi.advanceTimersByTime(80);

    spinner.stop();
    // No assertion needed - just verify it doesn't throw
  });

  it("shows completion message on stop", async () => {
    const { createSpinner } = await import("../utils/logger.js");
    const spinner = createSpinner("Loading...");

    spinner.stop("All done!");

    expect(logOutput.some((line) => line.includes("All done!"))).toBe(true);
  });

  it("can stop without completion message", async () => {
    const { createSpinner } = await import("../utils/logger.js");
    const spinner = createSpinner("Loading...");

    // Should not throw
    spinner.stop();
  });
});
