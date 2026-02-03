import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      include: [
        "src/utils/url.ts",
        "src/core/package.ts",
        "src/core/token-refresh.ts",
        "src/core/auth.ts",
        "src/core/registry.ts",
        "src/core/marketplace-installer.ts",
        "src/core/marketplace-search.ts",
        "src/core/marketplace-update-checker.ts",
        "src/core/skill.ts",
        "src/utils/markdown.ts",
        "src/utils/fs.ts",
        "src/utils/logger.ts",
      ],
      thresholds: {
        statements: 90,
        branches: 90,
        functions: 90,
        lines: 90,
      },
    },
  },
});
