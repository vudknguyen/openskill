import { mkdirSync, rmSync, writeFileSync } from "fs";
import { join, resolve, relative } from "path";
import { tmpdir } from "os";
import * as tar from "tar";
import { loadSkillFromDir } from "./skill.js";
import { addSkillRecord } from "./manifest.js";
import { getAgent } from "../agents/index.js";
import type { InstallScope } from "../agents/types.js";
import { logger, createSpinner } from "../utils/logger.js";
import {
  createMarketplaceClient,
  type MarketplaceClient,
  type DownloadMetadata,
} from "./marketplace-client.js";

export type { DownloadMetadata };

/**
 * Fetch download metadata from the marketplace API.
 * Calls GET /api/skills/{slug}/download
 */
export async function fetchMarketplaceSkill(
  serverUrl: string,
  slug: string,
  version?: string
): Promise<DownloadMetadata> {
  const client = createMarketplaceClient(serverUrl);
  return client.getSkillDownload(slug, version);
}

/**
 * Download a tar.gz from a presigned URL and extract to target directory.
 */
async function downloadAndExtract(
  client: MarketplaceClient,
  downloadUrl: string,
  targetDir: string
): Promise<void> {
  const buffer = await client.downloadFromPresignedUrl(downloadUrl);

  // Extract to a temp dir first, then move to target
  const tempDir = join(tmpdir(), `osk-install-${Date.now()}`);
  mkdirSync(tempDir, { recursive: true });

  const tempTarPath = join(tempDir, "skill.tar.gz");
  writeFileSync(tempTarPath, buffer);

  // Ensure target exists
  mkdirSync(targetDir, { recursive: true });

  // Extract with path traversal protection
  const resolvedTarget = resolve(targetDir);
  await tar.extract({
    file: tempTarPath,
    cwd: targetDir,
    filter: (path) => {
      const full = resolve(targetDir, path);
      const rel = relative(resolvedTarget, full);
      // Reject paths that escape the target directory
      return !rel.startsWith("..");
    },
  });
}

/**
 * Install a skill from the marketplace.
 * Orchestrates: fetch metadata -> download -> extract -> install to agent dir.
 */
export async function installFromMarketplace(
  slug: string,
  options: {
    agent?: string;
    version?: string;
    scope?: InstallScope;
    server?: string;
  }
): Promise<void> {
  const client = createMarketplaceClient(options.server);

  // 1. Fetch download metadata
  const fetchSpinner = createSpinner(`Fetching ${slug} from marketplace...`);
  let metadata: DownloadMetadata;
  try {
    metadata = await client.getSkillDownload(slug, options.version);
    fetchSpinner.stop(`Found ${slug}@${metadata.version}`);
  } catch (err) {
    fetchSpinner.stop();
    throw new Error(
      `Failed to find '${slug}' on marketplace: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // 2. Download, extract, and install (temp dir cleaned up in finally)
  const downloadSpinner = createSpinner("Downloading package...");
  const tempSkillDir = join(tmpdir(), `osk-marketplace-${slug}-${Date.now()}`);
  try {
    await downloadAndExtract(client, metadata.downloadUrl, tempSkillDir);
    downloadSpinner.stop("Downloaded");

    // 3. Load skill from extracted directory
    const skill = loadSkillFromDir(tempSkillDir);
    if (!skill) {
      throw new Error("Downloaded package does not contain a valid SKILL.md");
    }

    // 4. Determine target agent
    const agentName = options.agent || "claude";
    const agent = getAgent(agentName);
    if (!agent) {
      throw new Error(`Unknown agent: ${agentName}`);
    }

    const scope = options.scope ?? "project";

    // 5. Validate compatibility
    const validation = agent.validateSkill(skill);
    if (!validation.valid) {
      throw new Error(
        `${skill.frontmatter.name} not compatible with ${agent.displayName}: ${validation.errors.join(", ")}`
      );
    }

    // 6. Install to agent directory
    await agent.installSkill(skill, tempSkillDir, undefined, scope);

    // 7. Record in manifest with marketplace metadata
    addSkillRecord({
      name: skill.frontmatter.name,
      agent: agentName,
      repoOwner: "marketplace",
      repoName: slug,
      commitHash: metadata.fileHash || metadata.version,
      installedAt: new Date().toISOString(),
      scope,
      source: "marketplace",
      marketplaceSlug: slug,
      marketplaceVersion: metadata.version,
    });

    logger.success(
      `Installed ${skill.frontmatter.name}@${metadata.version} → ${agent.displayName}`
    );
  } catch (err) {
    downloadSpinner.stop();
    throw err;
  } finally {
    rmSync(tempSkillDir, { recursive: true, force: true });
  }
}
