import { describe, it, expect } from "vitest";
import {
  parseSkillMd,
  parseCursorRule,
  serializeSkillMd,
  serializeCursorRule,
  ParsedSkill,
  ParsedCursorRule,
} from "../utils/markdown.js";

describe("parseSkillMd", () => {
  it("parses valid SKILL.md with required fields", () => {
    const source = `---
name: my-skill
description: A test skill
---

# Instructions

Do something useful.`;

    const result = parseSkillMd(source);
    expect(result.frontmatter.name).toBe("my-skill");
    expect(result.frontmatter.description).toBe("A test skill");
    expect(result.content).toBe("# Instructions\n\nDo something useful.");
    expect(result.raw).toBe(source);
  });

  it("parses SKILL.md with optional fields", () => {
    const source = `---
name: my-skill
description: A test skill
license: MIT
compatibility: claude
allowed-tools: read,write
metadata:
  version: "1.0.0"
  author: test
---

Content here.`;

    const result = parseSkillMd(source);
    expect(result.frontmatter.name).toBe("my-skill");
    expect(result.frontmatter.license).toBe("MIT");
    expect(result.frontmatter.compatibility).toBe("claude");
    expect(result.frontmatter["allowed-tools"]).toBe("read,write");
    expect(result.frontmatter.metadata?.version).toBe("1.0.0");
    expect(result.frontmatter.metadata?.author).toBe("test");
  });

  it("throws error when name is missing", () => {
    const source = `---
description: A test skill
---

Content`;

    expect(() => parseSkillMd(source)).toThrow("name");
  });

  it("throws error when description is missing", () => {
    const source = `---
name: my-skill
---

Content`;

    expect(() => parseSkillMd(source)).toThrow("description");
  });

  it("throws error when name is not a string", () => {
    const source = `---
name: 123
description: A test skill
---

Content`;

    expect(() => parseSkillMd(source)).toThrow("name");
  });

  it("throws error when description is not a string", () => {
    const source = `---
name: my-skill
description: 123
---

Content`;

    expect(() => parseSkillMd(source)).toThrow("description");
  });

  it("handles empty content", () => {
    const source = `---
name: my-skill
description: A test skill
---
`;

    const result = parseSkillMd(source);
    expect(result.content).toBe("");
  });

  it("trims whitespace from content", () => {
    const source = `---
name: my-skill
description: A test skill
---

   Content with whitespace

`;

    const result = parseSkillMd(source);
    expect(result.content).toBe("Content with whitespace");
  });
});

describe("parseCursorRule", () => {
  it("parses cursor rule with frontmatter", () => {
    const source = `---
description: A cursor rule
alwaysApply: true
globs:
  - "*.ts"
  - "*.js"
---

Rule content here.`;

    const result = parseCursorRule(source);
    expect(result.frontmatter.description).toBe("A cursor rule");
    expect(result.frontmatter.alwaysApply).toBe(true);
    expect(result.frontmatter.globs).toEqual(["*.ts", "*.js"]);
    expect(result.content).toBe("Rule content here.");
  });

  it("parses cursor rule without frontmatter", () => {
    const source = `Just plain content without frontmatter.`;

    const result = parseCursorRule(source);
    expect(result.frontmatter).toEqual({});
    expect(result.content).toBe("Just plain content without frontmatter.");
  });

  it("parses cursor rule with empty frontmatter", () => {
    const source = `---
---

Content after empty frontmatter.`;

    const result = parseCursorRule(source);
    expect(result.frontmatter).toEqual({});
    expect(result.content).toBe("Content after empty frontmatter.");
  });
});

describe("serializeSkillMd", () => {
  it("serializes skill back to markdown", () => {
    const skill: ParsedSkill = {
      frontmatter: {
        name: "my-skill",
        description: "A test skill",
      },
      content: "# Instructions\n\nDo something.",
      raw: "",
    };

    const result = serializeSkillMd(skill);
    expect(result).toContain("name: my-skill");
    expect(result).toContain("description: A test skill");
    expect(result).toContain("# Instructions");
    expect(result).toContain("Do something.");
  });

  it("preserves optional fields", () => {
    const skill: ParsedSkill = {
      frontmatter: {
        name: "my-skill",
        description: "A test skill",
        license: "MIT",
      },
      content: "Content",
      raw: "",
    };

    const result = serializeSkillMd(skill);
    expect(result).toContain("license: MIT");
  });

  it("roundtrips correctly", () => {
    const original = `---
name: roundtrip-test
description: Testing roundtrip
license: Apache-2.0
---

# Content

Some markdown content.`;

    const parsed = parseSkillMd(original);
    const serialized = serializeSkillMd(parsed);
    const reparsed = parseSkillMd(serialized);

    expect(reparsed.frontmatter.name).toBe(parsed.frontmatter.name);
    expect(reparsed.frontmatter.description).toBe(parsed.frontmatter.description);
    expect(reparsed.frontmatter.license).toBe(parsed.frontmatter.license);
    expect(reparsed.content).toBe(parsed.content);
  });
});

describe("serializeCursorRule", () => {
  it("serializes cursor rule with frontmatter", () => {
    const rule: ParsedCursorRule = {
      frontmatter: {
        description: "A cursor rule",
        alwaysApply: true,
      },
      content: "Rule content",
      raw: "",
    };

    const result = serializeCursorRule(rule);
    expect(result).toContain("description: A cursor rule");
    expect(result).toContain("alwaysApply: true");
    expect(result).toContain("Rule content");
  });

  it("returns plain content when no frontmatter", () => {
    const rule: ParsedCursorRule = {
      frontmatter: {},
      content: "Just plain content",
      raw: "",
    };

    const result = serializeCursorRule(rule);
    expect(result).toBe("Just plain content");
    expect(result).not.toContain("---");
  });
});
