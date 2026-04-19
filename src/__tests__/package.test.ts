import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock fs
vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  return {
    ...actual,
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    readFileSync: vi.fn(),
    rmSync: vi.fn(),
  };
});

// Mock os.tmpdir
vi.mock("os", () => ({
  tmpdir: () => "/mock/tmp",
}));

// Mock tar.create
vi.mock("tar", () => ({
  create: vi.fn().mockResolvedValue(undefined),
}));

import { existsSync, readFileSync, mkdirSync, rmSync } from "fs";
import * as tar from "tar";
import { packageSkill, calculateHash, formatFileSize } from "../core/package.js";

const mockExistsSync = vi.mocked(existsSync);
const mockReadFileSync = vi.mocked(readFileSync);
const mockMkdirSync = vi.mocked(mkdirSync);
const mockRmSync = vi.mocked(rmSync);
const mockTarCreate = vi.mocked(tar.create);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("packageSkill", () => {
  it("throws when SKILL.md is missing", async () => {
    mockExistsSync.mockReturnValue(false);
    await expect(packageSkill("/skill-dir")).rejects.toThrow("No SKILL.md found in /skill-dir");
  });

  it("creates temp dir, tars, reads buffer, and cleans up", async () => {
    mockExistsSync.mockReturnValue(true);
    const tarContent = Buffer.from("fake-tar-gz");
    mockReadFileSync.mockReturnValue(tarContent);

    const result = await packageSkill("/skill-dir");

    expect(result).toEqual(tarContent);
    expect(mockMkdirSync).toHaveBeenCalledWith(expect.stringContaining("osk-pkg-"), {
      recursive: true,
    });
    expect(mockTarCreate).toHaveBeenCalledOnce();
    expect(mockRmSync).toHaveBeenCalledOnce();
  });

  it("succeeds even if temp file cleanup fails", async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(Buffer.from("data"));
    mockRmSync.mockImplementation(() => {
      throw new Error("ENOENT");
    });

    const result = await packageSkill("/skill-dir");
    expect(result).toEqual(Buffer.from("data"));
  });

  it("passes correct tar options", async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(Buffer.from("data"));

    await packageSkill("/skill-dir");

    const opts = mockTarCreate.mock.calls[0][0] as Record<string, unknown>;
    expect(opts.gzip).toBe(true);
    expect(opts.cwd).toBe("/skill-dir");
  });

  describe("filter", () => {
    async function getFilter(): Promise<(path: string) => boolean> {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(Buffer.from("data"));
      await packageSkill("/skill-dir");
      const opts = mockTarCreate.mock.calls[0][0] as Record<string, unknown>;
      return opts.filter as (path: string) => boolean;
    }

    it("excludes .git", async () => {
      const filter = await getFilter();
      expect(filter(".git")).toBe(false);
    });

    it("excludes node_modules", async () => {
      const filter = await getFilter();
      expect(filter("node_modules")).toBe(false);
    });

    it("excludes .env", async () => {
      const filter = await getFilter();
      expect(filter(".env")).toBe(false);
    });

    it("excludes .env.local (prefix glob)", async () => {
      const filter = await getFilter();
      expect(filter(".env.local")).toBe(false);
    });

    it("excludes *.log files (suffix glob)", async () => {
      const filter = await getFilter();
      expect(filter("debug.log")).toBe(false);
    });

    it("excludes *.pyc files", async () => {
      const filter = await getFilter();
      expect(filter("module.pyc")).toBe(false);
    });

    it("includes SKILL.md", async () => {
      const filter = await getFilter();
      expect(filter("SKILL.md")).toBe(true);
    });

    it("includes regular source files", async () => {
      const filter = await getFilter();
      expect(filter("index.ts")).toBe(true);
    });
  });
});

describe("calculateHash", () => {
  it("returns known SHA256 for known input", () => {
    const buffer = Buffer.from("hello world");
    expect(calculateHash(buffer)).toBe(
      "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9"
    );
  });

  it("returns valid 64-char hex hash for empty buffer", () => {
    const buffer = Buffer.alloc(0);
    const hash = calculateHash(buffer);
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });
});

describe("formatFileSize", () => {
  it("formats bytes < 1024 as B", () => {
    expect(formatFileSize(500)).toBe("500 B");
  });

  it("formats KB range", () => {
    expect(formatFileSize(2048)).toBe("2.0 KB");
  });

  it("formats MB range", () => {
    expect(formatFileSize(5 * 1024 * 1024)).toBe("5.0 MB");
  });

  it("formats exact boundary 1024 as 1.0 KB", () => {
    expect(formatFileSize(1024)).toBe("1.0 KB");
  });

  it("formats 0 bytes", () => {
    expect(formatFileSize(0)).toBe("0 B");
  });
});
