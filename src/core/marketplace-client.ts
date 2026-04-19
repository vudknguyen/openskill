import { loadAuth } from "./auth.js";
import { loadConfig } from "./config.js";
import { validateServerUrl, skillApiPath } from "../utils/url.js";

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

export class MarketplaceApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body?: unknown
  ) {
    super(message);
  }
}

// ---------------------------------------------------------------------------
// Response / request types
// ---------------------------------------------------------------------------

export interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete: string;
  expires_in: number;
  interval: number;
}

export interface DeviceTokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

export interface DeviceTokenErrorResponse {
  error: string;
}

export interface RefreshResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  refresh_expires_in?: number;
}

export interface MarketplaceSearchResponse {
  skills: Array<{
    skill: {
      slug: string;
      name: string;
      description: string;
      shortDescription: string | null;
      installCount: number;
      avgRating: string | null;
      tags: string | null;
    };
    author: { name: string } | null;
  }>;
  pagination: { total: number };
}

export interface UnifiedSkill {
  source: "openskill" | "github";
  id: string;
  slug: string;
  name: string;
  description: string;
  shortDescription?: string;
  authorName?: string;
  tags?: string;
  stars?: number;
  installCount?: number;
  avgRating?: string;
  repoUrl?: string;
  repoFullName?: string;
  skillPath?: string;
  defaultBranch?: string;
  license?: string;
  compatibility?: string;
  auditStatus?: "pass" | "warning" | "fail" | "unscanned" | null;
}

export interface DiscoverResponse {
  skills: UnifiedSkill[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export interface DownloadMetadata {
  downloadUrl: string;
  version: string;
  fileHash: string | null;
  fileSize: number | null;
}

export interface VersionEntry {
  version: string;
  fileHash: string | null;
  changelog: string | null;
  isLatest: boolean;
}

export interface VersionsResponse {
  versions: VersionEntry[];
  error?: string;
}

export interface StatusUpdateResponse {
  success?: boolean;
  status?: string;
  error?: string;
}

export interface PublishInitParams {
  slug: string;
  fileHash: string;
  fileSize: number;
  shortDescription?: string;
  tags?: string;
  pricingType?: string;
  changelog?: string;
  organizationId?: string;
  visibility?: string;
}

export interface PushInitResponse {
  uploadUrl?: string;
  uploadKey?: string;
  unchanged?: boolean;
  slug?: string;
  version?: string;
  name?: string;
  error?: string;
}

export interface PublishCompleteParams {
  uploadKey: string;
  slug: string;
  fileHash: string;
  shortDescription?: string;
  tags?: string;
  changelog?: string;
  organizationId?: string;
  visibility?: string;
}

/** Mirrors AuditFinding in skill-marketplace/src/lib/services/skill-audit-service.ts */
export interface AuditFinding {
  rule: string;
  severity: "critical" | "warning" | "info";
  message: string;
  line: number;
  snippet: string;
}

export interface AuditSkillResponse {
  status: "pass" | "warning" | "fail";
  score: number;
  scanVersion: string;
  scannedAt: string;
  findings: AuditFinding[];
  skill: { name: string; description: string };
}

export interface PushCompleteResponse {
  success: boolean;
  slug: string;
  version: string;
  name: string;
  status?: string;
  unchanged?: boolean;
  error?: string;
  details?: string[];
  auditFindings?: AuditFinding[];
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export interface OrgSummary {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  plan: string;
  seatLimit: number;
  requireAuditPass: boolean;
  role: string;
}

export interface OrgMemberInfo {
  id: string;
  userId: string;
  role: string;
  createdAt: string;
  userName: string;
  userEmail: string;
  userImage: string | null;
}

export interface OrgSkillsResponse {
  organization: { id: string; name: string; slug: string; requireAuditPass: boolean };
  skills: Array<{
    orgSkillId: string;
    skillId: number;
    skillSlug: string;
    skillName: string;
    skillDescription: string;
    skillAuditStatus: string;
    addedBy: string;
    addedAt: string;
  }>;
}

export class MarketplaceClient {
  constructor(private readonly serverUrl: string) {}

  // --- private helpers -----------------------------------------------------

  private async get(path: string, token?: string): Promise<Response> {
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    return fetch(`${this.serverUrl}${path}`, { headers });
  }

  private async post(path: string, body: unknown, token?: string): Promise<Response> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    return fetch(`${this.serverUrl}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
  }

  private async patch(path: string, body: unknown, token: string): Promise<Response> {
    return fetch(`${this.serverUrl}${path}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
  }

  private async del(path: string, token: string): Promise<Response> {
    return fetch(`${this.serverUrl}${path}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  // --- Auth ----------------------------------------------------------------

  async requestDeviceCode(clientInfo?: string): Promise<DeviceCodeResponse> {
    const res = await this.post("/api/auth/device/code", {
      client_info: clientInfo,
    });
    if (!res.ok) {
      throw new MarketplaceApiError(`Server returned ${res.status}`, res.status);
    }
    return (await res.json()) as DeviceCodeResponse;
  }

  async pollDeviceToken(
    deviceCode: string
  ): Promise<DeviceTokenResponse | DeviceTokenErrorResponse> {
    const res = await this.post("/api/auth/device/token", {
      device_code: deviceCode,
    });
    if (!res.ok && res.status >= 500) {
      throw new MarketplaceApiError(`Server error (${res.status})`, res.status);
    }
    return (await res.json()) as DeviceTokenResponse | DeviceTokenErrorResponse;
  }

  async fetchCurrentUser(token: string): Promise<{ id: string; name: string; email: string }> {
    const res = await this.get("/api/auth/me", token);
    if (!res.ok) {
      throw new MarketplaceApiError(`Failed to fetch user (${res.status})`, res.status);
    }
    const body = (await res.json()) as { user: { id: string; name: string; email: string } };
    return body.user;
  }

  async refreshToken(refreshToken: string): Promise<RefreshResponse> {
    const res = await this.post("/api/auth/refresh", {
      refresh_token: refreshToken,
    });
    if (!res.ok) {
      throw new MarketplaceApiError(`Refresh failed (${res.status})`, res.status);
    }
    return (await res.json()) as RefreshResponse;
  }

  async revokeToken(refreshToken: string): Promise<void> {
    try {
      await this.post("/api/auth/revoke", { refresh_token: refreshToken });
    } catch {
      // Best-effort — swallow errors
    }
  }

  // --- Skills --------------------------------------------------------------

  async searchSkills(query: string, limit?: number): Promise<MarketplaceSearchResponse> {
    const params = new URLSearchParams({
      q: query,
      limit: String(limit ?? 20),
    });
    const res = await this.get(`/api/skills?${params}`);
    if (!res.ok) {
      throw new MarketplaceApiError(`Marketplace search failed (${res.status})`, res.status);
    }
    return (await res.json()) as MarketplaceSearchResponse;
  }

  async discoverSkills(
    query: string,
    options?: { limit?: number; source?: string }
  ): Promise<DiscoverResponse> {
    const params = new URLSearchParams({
      q: query,
      limit: String(options?.limit ?? 20),
    });
    if (options?.source) params.set("source", options.source);
    const res = await this.get(`/api/skills/discover?${params}`);
    if (!res.ok) {
      throw new MarketplaceApiError(`Discovery failed (${res.status})`, res.status);
    }
    return (await res.json()) as DiscoverResponse;
  }

  async getSkillDownload(slug: string, version?: string): Promise<DownloadMetadata> {
    const path = skillApiPath(slug, "download");
    const url = version ? `${path}?version=${encodeURIComponent(version)}` : path;
    const res = await this.get(url);
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      throw new MarketplaceApiError(
        (body.error as string) || `Server returned ${res.status}`,
        res.status,
        body
      );
    }
    return (await res.json()) as DownloadMetadata;
  }

  async getSkillVersions(slug: string): Promise<VersionsResponse> {
    const res = await this.get(skillApiPath(slug, "versions"));
    if (!res.ok) {
      throw new MarketplaceApiError(`Failed to fetch versions (${res.status})`, res.status);
    }
    return (await res.json()) as VersionsResponse;
  }

  async updateSkillStatus(
    token: string,
    slug: string,
    status: string
  ): Promise<StatusUpdateResponse> {
    const res = await this.patch(skillApiPath(slug), { status }, token);
    const body = (await res.json()) as StatusUpdateResponse;
    if (!res.ok) {
      throw new MarketplaceApiError(body.error || `Server error (${res.status})`, res.status, body);
    }
    return body;
  }

  // --- Audit ---------------------------------------------------------------

  async auditSkill(content: string): Promise<AuditSkillResponse> {
    const res = await this.post("/api/skills/audit", { content });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      throw new MarketplaceApiError(
        (body.error as string) || `Audit failed (${res.status})`,
        res.status,
        body
      );
    }
    return (await res.json()) as AuditSkillResponse;
  }

  // --- Publish -------------------------------------------------------------

  async initPublish(token: string, params: PublishInitParams): Promise<PushInitResponse> {
    const res = await this.post("/api/skills/publish/init", params, token);
    const body = (await res.json()) as PushInitResponse;
    if (!res.ok) {
      throw new MarketplaceApiError(body.error || `Server error (${res.status})`, res.status, body);
    }
    return body;
  }

  async completePublish(
    token: string,
    params: PublishCompleteParams
  ): Promise<PushCompleteResponse> {
    const res = await this.post("/api/skills/publish/complete", params, token);
    const body = (await res.json()) as PushCompleteResponse;
    if (!res.ok) {
      throw new MarketplaceApiError(body.error || `Server error (${res.status})`, res.status, body);
    }
    return body;
  }

  // --- S3 presigned URL operations -----------------------------------------

  async uploadToPresignedUrl(url: string, data: Buffer): Promise<void> {
    const res = await fetch(url, {
      method: "PUT",
      headers: {
        "Content-Type": "application/gzip",
        "Content-Length": data.length.toString(),
      },
      body: data,
    });
    if (!res.ok) {
      throw new MarketplaceApiError(`Upload failed (${res.status})`, res.status);
    }
  }

  async downloadFromPresignedUrl(url: string): Promise<Buffer> {
    const res = await fetch(url);
    if (!res.ok) {
      throw new MarketplaceApiError(`Download failed (${res.status})`, res.status);
    }
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  // --- Organizations -------------------------------------------------------

  async listOrgs(token: string): Promise<OrgSummary[]> {
    const res = await this.get("/api/orgs", token);
    if (!res.ok) throw new MarketplaceApiError(`Failed to list orgs (${res.status})`, res.status);
    return (await res.json()) as OrgSummary[];
  }

  async createOrg(
    data: { name: string; slug: string; description?: string },
    token: string
  ): Promise<{ id: string; slug: string }> {
    const res = await this.post("/api/orgs", data, token);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new MarketplaceApiError(
        (body as { error?: string }).error || `Failed (${res.status})`,
        res.status,
        body
      );
    }
    return (await res.json()) as { id: string; slug: string };
  }

  async getOrgMembers(orgId: string, token: string): Promise<OrgMemberInfo[]> {
    const res = await this.get(`/api/orgs/${orgId}/members`, token);
    if (!res.ok) throw new MarketplaceApiError(`Failed to get members (${res.status})`, res.status);
    return (await res.json()) as OrgMemberInfo[];
  }

  async inviteOrgMember(
    orgId: string,
    email: string,
    role: string,
    token: string
  ): Promise<{ id: string; token: string }> {
    const res = await this.post(`/api/orgs/${orgId}/invites`, { email, role }, token);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new MarketplaceApiError(
        (body as { error?: string }).error || `Failed (${res.status})`,
        res.status,
        body
      );
    }
    return (await res.json()) as { id: string; token: string };
  }

  async removeOrgMember(orgId: string, userId: string, token: string): Promise<void> {
    const res = await this.del(`/api/orgs/${orgId}/members/${userId}`, token);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new MarketplaceApiError(
        (body as { error?: string }).error || `Failed (${res.status})`,
        res.status,
        body
      );
    }
  }

  async getOrgSkills(orgId: string, token: string): Promise<OrgSkillsResponse> {
    const res = await this.get(`/api/orgs/${orgId}/skills`, token);
    if (!res.ok)
      throw new MarketplaceApiError(`Failed to get org skills (${res.status})`, res.status);
    return (await res.json()) as OrgSkillsResponse;
  }

  async addSkillToOrg(orgId: string, skillSlug: string, token: string): Promise<void> {
    const res = await this.post(`/api/orgs/${orgId}/skills`, { skillSlug }, token);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new MarketplaceApiError(
        (body as { error?: string }).error || `Failed (${res.status})`,
        res.status,
        body
      );
    }
  }

  async removeSkillFromOrg(orgId: string, skillId: number, token: string): Promise<void> {
    const res = await this.del(`/api/orgs/${orgId}/skills/${skillId}`, token);
    if (!res.ok)
      throw new MarketplaceApiError(`Failed to remove skill (${res.status})`, res.status);
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createMarketplaceClient(serverOverride?: string): MarketplaceClient {
  const auth = loadAuth();
  const raw = serverOverride || auth?.serverUrl || loadConfig().serverUrl;
  return new MarketplaceClient(validateServerUrl(raw));
}
