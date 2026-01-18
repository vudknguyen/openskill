import {
  input as inquirerInput,
  select as inquirerSelect,
  checkbox as inquirerCheckbox,
  confirm as inquirerConfirm,
  search as inquirerSearch,
} from "@inquirer/prompts";
import { truncate } from "./fs.js";
import { logger } from "./logger.js";

// Custom error for prompt cancellation - allows cleanup before exit
export class PromptCancelledError extends Error {
  constructor() {
    super("Operation cancelled");
    this.name = "PromptCancelledError";
  }
}

/**
 * Checks if an error is a user cancellation (Ctrl+C/ESC).
 * @param err - The error to check.
 * @returns True if the error represents user cancellation.
 *
 * Note: @inquirer/prompts throws ExitPromptError when user cancels.
 */
function isUserCancellation(err: unknown): boolean {
  if (err instanceof Error) {
    // @inquirer/prompts uses ExitPromptError for cancellation
    return (
      err.name === "ExitPromptError" ||
      err.message.includes("User force closed") ||
      err.message.includes("force close")
    );
  }
  return false;
}

function handlePromptError(err: unknown): never {
  if (isUserCancellation(err)) {
    logger.cancelled();
    throw new PromptCancelledError();
  }
  // Re-throw non-cancellation errors so they're not hidden
  throw err;
}

export interface Choice<T> {
  name: string;
  hint?: string;
  value: T;
}

const HINT_MAX_LENGTH = 80;

export async function checkbox<T>(message: string, choices: Choice<T>[]): Promise<T[]> {
  try {
    const result = await inquirerCheckbox({
      message,
      choices: choices.map((c) => ({
        name: c.hint ? `${c.name} - ${truncate(c.hint, HINT_MAX_LENGTH)}` : c.name,
        value: c.value,
      })),
    });

    return result;
  } catch (err) {
    handlePromptError(err);
  }
}

export async function select<T>(message: string, choices: Choice<T>[]): Promise<T> {
  try {
    const result = await inquirerSelect({
      message,
      choices: choices.map((c) => ({
        name: c.hint ? `${c.name} - ${truncate(c.hint, HINT_MAX_LENGTH)}` : c.name,
        value: c.value,
      })),
    });

    return result;
  } catch (err) {
    handlePromptError(err);
  }
}

export async function input(
  message: string,
  validate?: (value: string) => boolean | string
): Promise<string> {
  try {
    const result = await inquirerInput({
      message,
      validate: validate
        ? (value: string) => {
            const res = validate(value);
            if (res === true) return true;
            return typeof res === "string" ? res : "Invalid input";
          }
        : undefined,
    });

    return result;
  } catch (err) {
    handlePromptError(err);
  }
}

export async function confirm(message: string, defaultValue = false): Promise<boolean> {
  try {
    const result = await inquirerConfirm({
      message,
      default: defaultValue,
    });

    return result;
  } catch (err) {
    handlePromptError(err);
  }
}

export function closePrompt(): void {
  // No-op - @inquirer/prompts handles cleanup automatically
}

export async function selectScope(): Promise<"project" | "global"> {
  try {
    const result = await inquirerSelect({
      message: "Install to:",
      choices: [
        { name: "Project (.agent/skills/) - version controlled", value: "project" as const },
        { name: "Global (~/.agent/skills/) - available everywhere", value: "global" as const },
      ],
    });

    return result;
  } catch (err) {
    handlePromptError(err);
  }
}

export async function autocomplete<T>(
  message: string,
  choices: Choice<T>[],
  options?: { multiple?: boolean }
): Promise<T[]> {
  // Build choices for search
  const searchChoices = choices.map((c) => ({
    name: c.hint ? `${c.name} - ${truncate(c.hint, HINT_MAX_LENGTH)}` : c.name,
    value: c.value,
  }));

  try {
    if (options?.multiple) {
      // Use checkbox with all choices for multiple selection
      const result = await inquirerCheckbox({
        message,
        choices: searchChoices,
      });
      return result;
    }

    // Use search for single selection with autocomplete
    const result = await inquirerSearch({
      message,
      source: async (term) => {
        if (!term) return searchChoices;
        const lowerTerm = term.toLowerCase();
        return searchChoices.filter((c) => c.name.toLowerCase().includes(lowerTerm));
      },
    });

    return [result];
  } catch (err) {
    handlePromptError(err);
  }
}
