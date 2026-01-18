import { describe, it, expect } from "vitest";
import { validateSkillName, validateSkillDescription } from "../core/skill.js";

describe("validateSkillName", () => {
  it("accepts valid skill names", () => {
    expect(validateSkillName("pdf")).toEqual({ valid: true });
    expect(validateSkillName("my-skill")).toEqual({ valid: true });
    expect(validateSkillName("skill123")).toEqual({ valid: true });
    expect(validateSkillName("a")).toEqual({ valid: true });
    expect(validateSkillName("my-cool-skill")).toEqual({ valid: true });
  });

  it("rejects empty names", () => {
    expect(validateSkillName("").valid).toBe(false);
    expect(validateSkillName("").error).toContain("empty");
  });

  it("rejects names over 64 characters", () => {
    const longName = "a".repeat(65);
    expect(validateSkillName(longName).valid).toBe(false);
    expect(validateSkillName(longName).error).toContain("64");
  });

  it("rejects names with uppercase letters", () => {
    expect(validateSkillName("MySkill").valid).toBe(false);
    expect(validateSkillName("SKILL").valid).toBe(false);
  });

  it("rejects names starting or ending with hyphen", () => {
    expect(validateSkillName("-skill").valid).toBe(false);
    expect(validateSkillName("skill-").valid).toBe(false);
  });

  it("rejects names with consecutive hyphens", () => {
    expect(validateSkillName("my--skill").valid).toBe(false);
    expect(validateSkillName("my--skill").error).toContain("consecutive");
  });

  it("rejects names with special characters", () => {
    expect(validateSkillName("my_skill").valid).toBe(false);
    expect(validateSkillName("my.skill").valid).toBe(false);
    expect(validateSkillName("my skill").valid).toBe(false);
  });
});

describe("validateSkillDescription", () => {
  it("accepts valid descriptions", () => {
    expect(validateSkillDescription("A skill for converting PDFs")).toEqual({ valid: true });
    expect(validateSkillDescription("X")).toEqual({ valid: true });
  });

  it("rejects empty descriptions", () => {
    expect(validateSkillDescription("").valid).toBe(false);
    expect(validateSkillDescription("").error).toContain("empty");
  });

  it("rejects descriptions over 1024 characters", () => {
    const longDesc = "a".repeat(1025);
    expect(validateSkillDescription(longDesc).valid).toBe(false);
    expect(validateSkillDescription(longDesc).error).toContain("1024");
  });
});
