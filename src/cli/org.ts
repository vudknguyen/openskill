import { Command } from "commander";
import { logger, createSpinner } from "../utils/logger.js";
import { createMarketplaceClient } from "../core/marketplace-client.js";
import { getValidAuth } from "../core/token-refresh.js";

export const orgCommand = new Command("org")
  .description("Manage organizations")
  .addHelpText(
    "after",
    `
Examples:
  $ osk org create                   # Create a new organization
  $ osk org ls                       # List your organizations
  $ osk org members <org>            # List org members
  $ osk org invite <org> <email>     # Invite a member
  $ osk org skills <org>             # List org's skill registry
`
  )
  .action(() => {
    orgCommand.help();
  });

// Subcommand: create
orgCommand
  .command("create")
  .description("Create a new organization")
  .argument("<name>", "Organization name")
  .option("-s, --slug <slug>", "URL-friendly slug (auto-generated from name if omitted)")
  .option("-d, --description <desc>", "Organization description")
  .action(async (name: string, opts: { slug?: string; description?: string }) => {
    const auth = await getValidAuth();
    if (!auth) { logger.error("Not logged in. Run 'osk login' first."); process.exitCode = 1; return; }
    const client = createMarketplaceClient();

    const slug = opts.slug || name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const spinner = createSpinner(`Creating organization "${name}"...`);

    try {
      const result = await client.createOrg(
        { name, slug, description: opts.description },
        auth.accessToken,
      );
      spinner.stop(`Organization created: ${result.slug}`);
      logger.dim(`  ID: ${result.id}`);
      logger.dim(`  Invite members: osk org invite ${result.slug} <email>`);
    } catch (err: unknown) {
      spinner.stop("Failed to create organization");
      logger.error(err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
    }
  });

// Subcommand: ls
orgCommand
  .command("ls")
  .alias("list")
  .description("List your organizations")
  .action(async () => {
    const auth = await getValidAuth();
    if (!auth) { logger.error("Not logged in. Run 'osk login' first."); process.exitCode = 1; return; }
    const client = createMarketplaceClient();

    const spinner = createSpinner("Loading organizations...");
    try {
      const orgs = await client.listOrgs(auth.accessToken);
      spinner.stop(`${orgs.length} organization(s)`);

      if (orgs.length === 0) {
        logger.dim("No organizations yet. Create one with: osk org create <name>");
        return;
      }

      for (const org of orgs) {
        logger.log(`  ${org.name} (${org.slug})`);
        logger.dim(`    Role: ${org.role} | Plan: ${org.plan} | Seats: ${org.seatLimit}`);
        if (org.requireAuditPass) logger.dim("    Audit policy: required");
      }
    } catch (err: unknown) {
      spinner.stop("Failed to list organizations");
      logger.error(err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
    }
  });

// Subcommand: members
orgCommand
  .command("members <org>")
  .description("List organization members")
  .action(async (orgSlugOrId: string) => {
    const auth = await getValidAuth();
    if (!auth) { logger.error("Not logged in. Run 'osk login' first."); process.exitCode = 1; return; }
    const client = createMarketplaceClient();

    const orgId = await resolveOrgId(client, orgSlugOrId, auth.accessToken);
    const spinner = createSpinner("Loading members...");
    try {
      const members = await client.getOrgMembers(orgId, auth.accessToken);
      spinner.stop(`${members.length} member(s)`);

      for (const m of members) {
        logger.log(`  ${m.userName} <${m.userEmail}>`);
        logger.dim(`    Role: ${m.role}`);
      }
    } catch (err: unknown) {
      spinner.stop("Failed to list members");
      logger.error(err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
    }
  });

// Subcommand: invite
orgCommand
  .command("invite <org> <email>")
  .description("Invite a member to the organization")
  .option("-r, --role <role>", "Role: admin or member", "member")
  .action(async (orgSlugOrId: string, email: string, opts: { role: string }) => {
    const auth = await getValidAuth();
    if (!auth) { logger.error("Not logged in. Run 'osk login' first."); process.exitCode = 1; return; }
    const client = createMarketplaceClient();

    const orgId = await resolveOrgId(client, orgSlugOrId, auth.accessToken);
    const spinner = createSpinner(`Inviting ${email}...`);
    try {
      const result = await client.inviteOrgMember(orgId, email, opts.role, auth.accessToken);
      spinner.stop(`Invitation sent to ${email}`);

      // Show invite URL so admin can share it manually (e.g., when email isn't configured)
      const serverUrl = auth.serverUrl || "http://localhost:3000";
      const inviteUrl = `${serverUrl}/org/invite/${result.token}`;
      logger.newline();
      logger.dim("  Share this link if the email doesn't arrive:");
      logger.log(`  ${inviteUrl}`);
    } catch (err: unknown) {
      spinner.stop("Failed to send invite");
      logger.error(err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
    }
  });

// Subcommand: skills
orgCommand
  .command("skills <org>")
  .description("List organization's skill registry")
  .action(async (orgSlugOrId: string) => {
    const auth = await getValidAuth();
    if (!auth) { logger.error("Not logged in. Run 'osk login' first."); process.exitCode = 1; return; }
    const client = createMarketplaceClient();

    const orgId = await resolveOrgId(client, orgSlugOrId, auth.accessToken);
    const spinner = createSpinner("Loading org skills...");
    try {
      const result = await client.getOrgSkills(orgId, auth.accessToken);
      spinner.stop(`${result.skills.length} skill(s) in ${result.organization.name}`);

      if (result.organization.requireAuditPass) {
        logger.dim("  Audit policy: skills must pass audit before install");
      }

      if (result.skills.length === 0) {
        logger.dim("  No skills in registry. Add one with: osk org add-skill <org> <skill-slug>");
        return;
      }

      for (const s of result.skills) {
        const auditBadge = s.skillAuditStatus === "pass" ? "✓" : s.skillAuditStatus === "fail" ? "✗" : "?";
        logger.log(`  ${auditBadge} ${s.skillName} (${s.skillSlug})`);
        logger.dim(`    ${s.skillDescription.slice(0, 80)}`);
      }
    } catch (err: unknown) {
      spinner.stop("Failed to list org skills");
      logger.error(err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
    }
  });

// Subcommand: add-skill
orgCommand
  .command("add-skill <org> <skill-slug>")
  .description("Add a skill to the organization's registry")
  .action(async (orgSlugOrId: string, skillSlug: string) => {
    const auth = await getValidAuth();
    if (!auth) { logger.error("Not logged in. Run 'osk login' first."); process.exitCode = 1; return; }
    const client = createMarketplaceClient();

    const orgId = await resolveOrgId(client, orgSlugOrId, auth.accessToken);
    const spinner = createSpinner(`Adding "${skillSlug}" to org registry...`);
    try {
      await client.addSkillToOrg(orgId, skillSlug, auth.accessToken);
      spinner.stop(`Skill "${skillSlug}" added to organization registry`);
    } catch (err: unknown) {
      spinner.stop("Failed to add skill");
      logger.error(err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
    }
  });

// Subcommand: rm-skill
orgCommand
  .command("rm-skill <org> <skill-slug>")
  .description("Remove a skill from the organization's registry")
  .action(async (orgSlugOrId: string, skillSlug: string) => {
    const auth = await getValidAuth();
    if (!auth) { logger.error("Not logged in. Run 'osk login' first."); process.exitCode = 1; return; }
    const client = createMarketplaceClient();

    const orgId = await resolveOrgId(client, orgSlugOrId, auth.accessToken);

    // First get the org skills to find the skill ID
    const result = await client.getOrgSkills(orgId, auth.accessToken);
    const match = result.skills.find((s) => s.skillSlug === skillSlug);
    if (!match) {
      logger.error(`Skill "${skillSlug}" is not in this organization's registry`);
      process.exitCode = 1;
      return;
    }

    const spinner = createSpinner(`Removing "${skillSlug}" from org registry...`);
    try {
      await client.removeSkillFromOrg(orgId, match.skillId, auth.accessToken);
      spinner.stop(`Skill "${skillSlug}" removed from organization registry`);
    } catch (err: unknown) {
      spinner.stop("Failed to remove skill");
      logger.error(err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
    }
  });

// Subcommand: set-default
orgCommand
  .command("set-default <org>")
  .description("Set default organization (used when --org is omitted)")
  .action(async (orgSlugOrId: string) => {
    const auth = await getValidAuth();
    if (!auth) { logger.error("Not logged in. Run 'osk login' first."); process.exitCode = 1; return; }
    const client = createMarketplaceClient();

    // Verify org exists and user is a member
    const orgs = await client.listOrgs(auth.accessToken);
    const match = orgs.find((o) => o.slug === orgSlugOrId || o.id === orgSlugOrId);
    if (!match) {
      logger.error(`Organization "${orgSlugOrId}" not found. Run 'osk org ls' to see your organizations.`);
      process.exitCode = 1;
      return;
    }

    const { loadConfig, saveConfig } = await import("../core/config.js");
    const config = loadConfig();
    config.defaultOrg = match.slug;
    saveConfig(config);

    logger.success(`Default organization set to "${match.slug}"`);
    logger.dim("Commands like 'osk install', 'osk push' will use this org when --org is omitted.");
  });

// Subcommand: policy
orgCommand
  .command("policy <org> <policy>")
  .description("Set install policy: open, allowlist, or blocklist")
  .addHelpText(
    "after",
    `
Policies:
  open       Members can install any skill (default)
  allowlist  Members can only install skills in the org registry
  blocklist  Members can install anything except blocked skills

Examples:
  $ osk org policy my-team allowlist   # Restrict to approved skills only
  $ osk org policy my-team open        # Allow all skills
`
  )
  .action(async (orgSlugOrId: string, policy: string) => {
    if (!["open", "allowlist", "blocklist"].includes(policy)) {
      logger.error(`Invalid policy: ${policy}. Must be: open, allowlist, or blocklist`);
      process.exitCode = 1;
      return;
    }

    const auth = await getValidAuth();
    if (!auth) { logger.error("Not logged in. Run 'osk login' first."); process.exitCode = 1; return; }
    const client = createMarketplaceClient();

    const orgId = await resolveOrgId(client, orgSlugOrId, auth.accessToken);
    const spinner = createSpinner(`Setting install policy to "${policy}"...`);
    try {
      const res = await fetch(`${auth.serverUrl}/api/orgs/${orgId}/settings`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${auth.accessToken}`,
        },
        body: JSON.stringify({ installPolicy: policy }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        spinner.stop();
        logger.error((body as { error?: string }).error || `Failed (${res.status})`);
        process.exitCode = 1;
        return;
      }
      spinner.stop(`Install policy set to "${policy}"`);
    } catch (err: unknown) {
      spinner.stop("Failed to update policy");
      logger.error(err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
    }
  });

// Subcommand: block
orgCommand
  .command("block <org> <skill-slug>")
  .description("Block a skill from being installed by org members")
  .option("-r, --reason <reason>", "Reason for blocking")
  .action(async (orgSlugOrId: string, skillSlug: string, opts: { reason?: string }) => {
    const auth = await getValidAuth();
    if (!auth) { logger.error("Not logged in. Run 'osk login' first."); process.exitCode = 1; return; }
    const client = createMarketplaceClient();

    const orgId = await resolveOrgId(client, orgSlugOrId, auth.accessToken);
    const spinner = createSpinner(`Blocking "${skillSlug}"...`);
    try {
      const res = await fetch(`${auth.serverUrl}/api/orgs/${orgId}/blocked-skills`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${auth.accessToken}`,
        },
        body: JSON.stringify({ skillSlug, reason: opts.reason }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        spinner.stop();
        logger.error((body as { error?: string }).error || `Failed (${res.status})`);
        process.exitCode = 1;
        return;
      }
      spinner.stop(`Blocked "${skillSlug}"`);
    } catch (err: unknown) {
      spinner.stop("Failed to block skill");
      logger.error(err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
    }
  });

// Subcommand: unblock
orgCommand
  .command("unblock <org> <skill-slug>")
  .description("Unblock a previously blocked skill")
  .action(async (orgSlugOrId: string, skillSlug: string) => {
    const auth = await getValidAuth();
    if (!auth) { logger.error("Not logged in. Run 'osk login' first."); process.exitCode = 1; return; }
    const client = createMarketplaceClient();

    const orgId = await resolveOrgId(client, orgSlugOrId, auth.accessToken);
    const spinner = createSpinner(`Unblocking "${skillSlug}"...`);
    try {
      const res = await fetch(`${auth.serverUrl}/api/orgs/${orgId}/blocked-skills`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${auth.accessToken}`,
        },
        body: JSON.stringify({ skillSlug }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        spinner.stop();
        logger.error((body as { error?: string }).error || `Failed (${res.status})`);
        process.exitCode = 1;
        return;
      }
      spinner.stop(`Unblocked "${skillSlug}"`);
    } catch (err: unknown) {
      spinner.stop("Failed to unblock skill");
      logger.error(err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
    }
  });

// Helper: resolve slug to org ID
async function resolveOrgId(
  client: ReturnType<typeof createMarketplaceClient>,
  slugOrId: string,
  token: string,
): Promise<string> {
  const orgs = await client.listOrgs(token);
  const match = orgs.find((o) => o.slug === slugOrId || o.id === slugOrId);
  if (!match) {
    logger.error(`Organization "${slugOrId}" not found. Run 'osk org ls' to see your organizations.`);
    process.exit(1);
  }
  return match.id;
}
