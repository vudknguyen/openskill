// ANSI color codes - no external dependency needed
const colors = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  underline: "\x1b[4m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
};

function colorize(color: keyof typeof colors, text: string): string {
  return `${colors[color]}${text}${colors.reset}`;
}

// Internal console wrapper - all output goes through here
const out = {
  log: (...args: unknown[]) => console.log(...args),
  error: (...args: unknown[]) => console.error(...args),
  write: (text: string) => process.stdout.write(text),
  clearLine: () => {
    process.stdout.clearLine?.(0);
    process.stdout.cursorTo?.(0);
  },
};

// Simple spinner for async operations
const spinnerFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export interface Spinner {
  stop: (message?: string) => void;
  update: (message: string) => void;
}

export function createSpinner(message: string): Spinner {
  let frameIndex = 0;
  let currentMessage = message;
  const isInteractive = process.stdout.isTTY;

  if (!isInteractive) {
    // Non-interactive: just log the message
    out.log(colorize("blue", "⏳"), currentMessage);
    return {
      stop: (msg?: string) => {
        if (msg) out.log(colorize("green", "✔"), msg);
      },
      update: () => {},
    };
  }

  const interval = setInterval(() => {
    out.clearLine();
    out.write(`${colorize("cyan", spinnerFrames[frameIndex])} ${currentMessage}`);
    frameIndex = (frameIndex + 1) % spinnerFrames.length;
  }, 80);

  return {
    stop: (msg?: string) => {
      clearInterval(interval);
      out.clearLine();
      if (msg) {
        out.log(colorize("green", "✔"), msg);
      }
    },
    update: (msg: string) => {
      currentMessage = msg;
    },
  };
}

export const logger = {
  // Plain output (no formatting)
  log: (message: string) => out.log(message),
  newline: () => out.log(),

  // Status messages
  info: (message: string) => out.log(colorize("blue", "ℹ"), message),
  success: (message: string) => out.log(colorize("green", "✔"), message),
  warn: (message: string) => out.log(colorize("yellow", "⚠"), message),
  error: (message: string) => out.log(colorize("red", "✖"), message),
  dim: (message: string) => out.log(colorize("dim", message)),

  // Raw error output (for uncaught errors, goes to stderr)
  rawError: (err: unknown) => out.error(err),

  // Cancellation message
  cancelled: () => out.log(colorize("dim", "\nOperation cancelled")),

  skill: (name: string, description?: string) => {
    out.log(colorize("cyan", "  •"), colorize("bold", name));
    if (description) {
      out.log(colorize("dim", `    ${description}`));
    }
  },

  // Compact skill display with version and agent icon
  skillCompact: (
    name: string,
    version: string,
    icon?: string,
    iconColor?: string,
    scope?: string
  ) => {
    const nameCol = colorize("bold", name.padEnd(20));
    const versionCol = colorize("dim", version.padEnd(10));
    const iconDisplay = icon ? `${iconColor || ""}${icon}${colors.reset} ` : "  ";
    const scopeDisplay = scope === "global" ? colorize("dim", " [G]") : "";
    out.log(`  ${iconDisplay}${nameCol} ${versionCol}${scopeDisplay}`);
  },

  header: (title: string) => {
    out.log();
    out.log(`${colors.bold}${colors.underline}${title}${colors.reset}`);
    out.log();
  },

  table: (rows: Array<Record<string, string>>, columns: string[]) => {
    if (rows.length === 0) return;

    const widths = columns.map((col) =>
      Math.max(col.length, ...rows.map((row) => (row[col] || "").length))
    );

    // Header
    out.log(columns.map((col, i) => colorize("bold", col.padEnd(widths[i]))).join("  "));
    out.log(widths.map((w) => "─".repeat(w)).join("──"));

    // Rows
    for (const row of rows) {
      out.log(columns.map((col, i) => (row[col] || "").padEnd(widths[i])).join("  "));
    }
  },
};
