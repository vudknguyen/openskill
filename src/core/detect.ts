import { existsSync } from "fs";
import { join } from "path";

export interface DetectedStack {
  name: string;
  tags: string[];
}

const STACK_DETECTORS: Array<{ file: string; stack: DetectedStack }> = [
  { file: "package.json", stack: { name: "Node.js / JavaScript", tags: ["javascript", "nodejs"] } },
  { file: "tsconfig.json", stack: { name: "TypeScript", tags: ["typescript", "nodejs"] } },
  { file: "Cargo.toml", stack: { name: "Rust", tags: ["rust"] } },
  { file: "go.mod", stack: { name: "Go", tags: ["go", "golang"] } },
  { file: "requirements.txt", stack: { name: "Python", tags: ["python"] } },
  { file: "pyproject.toml", stack: { name: "Python", tags: ["python"] } },
  { file: "Gemfile", stack: { name: "Ruby", tags: ["ruby"] } },
  { file: "pom.xml", stack: { name: "Java (Maven)", tags: ["java"] } },
  { file: "build.gradle", stack: { name: "Java/Kotlin (Gradle)", tags: ["java", "kotlin"] } },
  { file: "composer.json", stack: { name: "PHP", tags: ["php"] } },
  { file: "pubspec.yaml", stack: { name: "Dart / Flutter", tags: ["dart", "flutter"] } },
  { file: "Package.swift", stack: { name: "Swift", tags: ["swift"] } },
  { file: "next.config.js", stack: { name: "Next.js", tags: ["nextjs", "react"] } },
  { file: "next.config.ts", stack: { name: "Next.js", tags: ["nextjs", "react"] } },
  { file: "nuxt.config.ts", stack: { name: "Nuxt", tags: ["nuxt", "vue"] } },
  { file: "svelte.config.js", stack: { name: "SvelteKit", tags: ["svelte"] } },
  { file: "angular.json", stack: { name: "Angular", tags: ["angular"] } },
  { file: "docker-compose.yml", stack: { name: "Docker", tags: ["docker", "devops"] } },
  { file: "Dockerfile", stack: { name: "Docker", tags: ["docker", "devops"] } },
  { file: ".github/workflows", stack: { name: "GitHub Actions", tags: ["github-actions", "ci"] } },
];

/**
 * Detect the tech stack in the given directory by checking for known config files.
 */
export function detectStack(dir: string = process.cwd()): DetectedStack[] {
  const detected: DetectedStack[] = [];
  const seen = new Set<string>();

  for (const { file, stack } of STACK_DETECTORS) {
    if (existsSync(join(dir, file)) && !seen.has(stack.name)) {
      detected.push(stack);
      seen.add(stack.name);
    }
  }

  return detected;
}

/**
 * Get unique tags from all detected stacks.
 */
export function getStackTags(stacks: DetectedStack[]): string[] {
  const tags = new Set<string>();
  for (const stack of stacks) {
    for (const tag of stack.tags) {
      tags.add(tag);
    }
  }
  return [...tags];
}
