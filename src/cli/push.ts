import { Command } from "commander";
import { resolve, join } from "path";
import { existsSync, readFileSync } from "fs";
import { getValidAuth } from "../core/token-refresh.js";
import { packageSkill, calculateHash, formatFileSize } from "../core/package.js";
import { parseSkillMd } from "../utils/markdown.js";
import { logger, createSpinner } from "../utils/logger.js";
import { confirm } from "../utils/prompt.js";
import { validateServerUrl } from "../utils/url.js";

interface PushInitResponse {
  uploadUrl?: string;
  uploadKey?: string;
  unchanged?: boolean;
  slug?: string;
  version?: string;
  name?: string;
  error?: string;
}

interface PushCompleteResponse {
  success: boolean;
  slug: string;
  version: string;
  name: string;
  error?: string;
  details?: string[];
}

export const pushCommand = new Command("push")
  .description("Push a skill version to the OpenSkill marketplace (as draft)")
  .argument("[directory]", "Skill directory (default: current directory)", ".")
  .option("--category <slug>", "Category slug")
  .option("--short-desc <text>", "Short description (300 chars max)")
  .option("--tags <tags>", "Comma-separated tags")
  .option("--changelog <text>", "Version changelog")
  .option("-y, --yes", "Skip confirmation prompt")
  .option("-s, --server <url>", "Server URL override")
  .addHelpText(
    "after",
    `
Examples:
  $ osk push                                  # Push current directory
  $ osk push ./my-skill                       # Push specific directory
  $ osk push . --category productivity        # With category
  $ osk push . --tags "pdf,reader" -y         # With tags, skip confirm
  $ osk push . --changelog "Fixed edge case"  # With changelog
`
  )
  .action(
    async (
      directory: string,
      options: {
        category?: string;
        shortDesc?: string;
        tags?: string;
        changelog?: string;
        yes?: boolean;
        server?: string;
      }
    ) => {
      // 1. Check auth (auto-refreshes access token if expired)
      const auth = await getValidAuth();
      if (!auth) {
        logger.error("Not logged in. Run 'osk login' first.");
        process.exit(1);
      }

      const serverUrl = validateServerUrl(options.server || auth.serverUrl);

      // 2. Resolve skill directory
      const skillDir = resolve(directory);
      const skillMdPath = join(skillDir, "SKILL.md");

      if (!existsSync(skillMdPath)) {
        logger.error(`No SKILL.md found in ${skillDir}`);
        logger.dim("Create a SKILL.md file or specify a valid skill directory.");
        process.exit(1);
      }

      // 3. Parse SKILL.md locally
      let skillMd;
      try {
        const content = readFileSync(skillMdPath, "utf-8");
        skillMd = parseSkillMd(content);
      } catch (err) {
        logger.error(
          `Invalid SKILL.md: ${err instanceof Error ? err.message : String(err)}`
        );
        process.exit(1);
      }

      const slug = skillMd.frontmatter.name;
      const version =
        skillMd.frontmatter.metadata?.version || "(auto from hash)";

      // 4. Package directory
      const packSpinner = createSpinner("Packaging skill...");
      let buffer: Buffer;
      try {
        buffer = await packageSkill(skillDir);
        packSpinner.stop("Packaged");
      } catch (err) {
        packSpinner.stop();
        logger.error(
          `Packaging failed: ${err instanceof Error ? err.message : String(err)}`
        );
        process.exit(1);
      }

      // 5. Calculate hash
      const fileHash = calculateHash(buffer);

      // 6. Show summary
      logger.newline();
      logger.log(`  Name:     ${slug}`);
      logger.log(`  Version:  ${version}`);
      logger.log(`  Size:     ${formatFileSize(buffer.length)}`);
      logger.log(`  Hash:     ${fileHash.slice(0, 16)}...`);
      logger.newline();

      // 7. Confirm
      if (!options.yes) {
        const proceed = await confirm("Push this skill?", true);
        if (!proceed) {
          logger.cancelled();
          return;
        }
      }

      // 8. POST /api/skills/publish/init
      const initSpinner = createSpinner("Initializing...");
      let initResult: PushInitResponse;
      try {
        const res = await fetch(`${serverUrl}/api/skills/publish/init`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${auth.accessToken}`,
          },
          body: JSON.stringify({
            slug,
            fileHash,
            fileSize: buffer.length,
            category: options.category,
            shortDescription: options.shortDesc,
            tags: options.tags,
            pricingType: "free",
            changelog: options.changelog,
          }),
        });

        initResult = (await res.json()) as PushInitResponse;

        if (!res.ok) {
          initSpinner.stop();
          logger.error(initResult.error || `Server error (${res.status})`);
          process.exit(1);
        }
        if (initResult.unchanged) {
          initSpinner.stop("No changes");
          logger.newline();
          logger.dim(`${initResult.name}@${initResult.version} is already up to date`);
          return;
        }

        if (!initResult.uploadUrl || !initResult.uploadKey) {
          initSpinner.stop();
          logger.error("Server response missing upload information");
          process.exit(1);
        }
        initSpinner.stop("Initialized");
      } catch (err) {
        initSpinner.stop();
        logger.error(
          `Failed to connect to server: ${err instanceof Error ? err.message : String(err)}`
        );
        process.exit(1);
      }

      // 9. PUT to presigned S3 URL
      const uploadSpinner = createSpinner("Uploading package...");
      try {
        const uploadRes = await fetch(initResult.uploadUrl, {
          method: "PUT",
          headers: {
            "Content-Type": "application/gzip",
            "Content-Length": buffer.length.toString(),
          },
          body: buffer,
        });

        if (!uploadRes.ok) {
          uploadSpinner.stop();
          logger.error(`Upload failed (${uploadRes.status})`);
          process.exit(1);
        }
        uploadSpinner.stop("Uploaded");
      } catch (err) {
        uploadSpinner.stop();
        logger.error(
          `Upload failed: ${err instanceof Error ? err.message : String(err)}`
        );
        process.exit(1);
      }

      // 10. POST /api/skills/publish/complete
      const completeSpinner = createSpinner("Finalizing...");
      try {
        const res = await fetch(`${serverUrl}/api/skills/publish/complete`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${auth.accessToken}`,
          },
          body: JSON.stringify({
            uploadKey: initResult.uploadKey,
            slug,
            fileHash,
            // Pass metadata again for skill creation
            category: options.category,
            shortDescription: options.shortDesc,
            tags: options.tags,
            changelog: options.changelog,
          }),
        });

        const result = (await res.json()) as PushCompleteResponse;

        if (!res.ok) {
          completeSpinner.stop();
          if (result.details && Array.isArray(result.details)) {
            logger.error(`${result.error}: ${result.details.join(", ")}`);
          } else {
            logger.error(result.error || `Server error (${res.status})`);
          }
          process.exit(1);
        }

        completeSpinner.stop("Pushed");
        logger.newline();
        logger.success(`${result.name}@${result.version} pushed to marketplace (draft)`);
        logger.dim(`  ${serverUrl}/skills/${result.slug}`);
        logger.newline();
        logger.dim("Run 'osk publish <slug>' to make it public.");
      } catch (err) {
        completeSpinner.stop();
        logger.error(
          `Finalization failed: ${err instanceof Error ? err.message : String(err)}`
        );
        process.exit(1);
      }
    }
  );
