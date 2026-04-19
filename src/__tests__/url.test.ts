import { describe, it, expect } from "vitest";
import { validateServerUrl, skillApiPath } from "../utils/url.js";

describe("validateServerUrl", () => {
  it("returns origin for valid https URL", () => {
    expect(validateServerUrl("https://example.com")).toBe(
      "https://example.com"
    );
  });

  it("returns origin for valid http URL", () => {
    expect(validateServerUrl("http://localhost:3000")).toBe(
      "http://localhost:3000"
    );
  });

  it("strips trailing path and slash", () => {
    expect(validateServerUrl("https://example.com/api/v1/")).toBe(
      "https://example.com"
    );
  });

  it("throws for ftp:// protocol", () => {
    expect(() => validateServerUrl("ftp://example.com")).toThrow(
      "Unsupported protocol"
    );
  });

  it("throws for invalid string", () => {
    expect(() => validateServerUrl("not-a-url")).toThrow("Invalid server URL");
  });
});

describe("skillApiPath", () => {
  it("returns correct path for normal slug", () => {
    expect(skillApiPath("my-skill")).toBe("/api/skills/my-skill");
  });

  it("encodes special characters in slug", () => {
    expect(skillApiPath("my skill/test")).toBe(
      "/api/skills/my%20skill%2Ftest"
    );
  });

  it("appends additional segments", () => {
    expect(skillApiPath("my-skill", "versions", "latest")).toBe(
      "/api/skills/my-skill/versions/latest"
    );
  });

  it("throws for empty slug", () => {
    expect(() => skillApiPath("")).toThrow("Slug cannot be empty");
  });
});
