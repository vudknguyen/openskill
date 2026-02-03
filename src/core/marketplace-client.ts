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
    public readonly body?: unknown,
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
    };
    author: { name: string } | null;
  }>;
  pagination: { total: number };
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
  category?: string;
  shortDescription?: string;
  tags?: string;
  pricingType?: string;
  changelog?: string;
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
  category?: string;
  shortDescription?: string;
  tags?: string;
  changelog?: string;
}

export interface PushCompleteResponse {
  success: boolean;
  slug: string;
  version: string;
  name: string;
  error?: string;
  details?: string[];
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

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
    deviceCode: string,
  ): Promise<DeviceTokenResponse | DeviceTokenErrorResponse> {
    const res = await this.post("/api/auth/device/token", {
      device_code: deviceCode,
    });
    return (await res.json()) as DeviceTokenResponse | DeviceTokenErrorResponse;
  }

  async fetchCurrentUser(
    token: string,
  ): Promise<{ id: string; name: string; email: string }> {
    const res = await this.get("/api/auth/me", token);
    if (!res.ok) {
      throw new MarketplaceApiError(
        `Failed to fetch user (${res.status})`,
        res.status,
      );
    }
    const body = (await res.json()) as { user: { id: string; name: string; email: string } };
    return body.user;
  }

  async refreshToken(refreshToken: string): Promise<RefreshResponse> {
    const res = await this.post("/api/auth/refresh", {
      refresh_token: refreshToken,
    });
    if (!res.ok) {
      throw new MarketplaceApiError(
        `Refresh failed (${res.status})`,
        res.status,
      );
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

  async searchSkills(
    query: string,
    limit?: number,
  ): Promise<MarketplaceSearchResponse> {
    const params = new URLSearchParams({
      q: query,
      limit: String(limit ?? 20),
    });
    const res = await this.get(`/api/skills?${params}`);
    if (!res.ok) {
      throw new MarketplaceApiError(
        `Marketplace search failed (${res.status})`,
        res.status,
      );
    }
    return (await res.json()) as MarketplaceSearchResponse;
  }

  async getSkillDownload(
    slug: string,
    version?: string,
  ): Promise<DownloadMetadata> {
    const path = skillApiPath(slug, "download");
    const url = version
      ? `${path}?version=${encodeURIComponent(version)}`
      : path;
    const res = await this.get(url);
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      throw new MarketplaceApiError(
        (body.error as string) || `Server returned ${res.status}`,
        res.status,
        body,
      );
    }
    return (await res.json()) as DownloadMetadata;
  }

  async getSkillVersions(slug: string): Promise<VersionsResponse> {
    const res = await this.get(skillApiPath(slug, "versions"));
    if (!res.ok) {
      throw new MarketplaceApiError(
        `Failed to fetch versions (${res.status})`,
        res.status,
      );
    }
    return (await res.json()) as VersionsResponse;
  }

  async updateSkillStatus(
    token: string,
    slug: string,
    status: string,
  ): Promise<StatusUpdateResponse> {
    const res = await this.patch(skillApiPath(slug), { status }, token);
    const body = (await res.json()) as StatusUpdateResponse;
    if (!res.ok) {
      throw new MarketplaceApiError(
        body.error || `Server error (${res.status})`,
        res.status,
        body,
      );
    }
    return body;
  }

  // --- Publish -------------------------------------------------------------

  async initPublish(
    token: string,
    params: PublishInitParams,
  ): Promise<PushInitResponse> {
    const res = await this.post("/api/skills/publish/init", params, token);
    const body = (await res.json()) as PushInitResponse;
    if (!res.ok) {
      throw new MarketplaceApiError(
        body.error || `Server error (${res.status})`,
        res.status,
        body,
      );
    }
    return body;
  }

  async completePublish(
    token: string,
    params: PublishCompleteParams,
  ): Promise<PushCompleteResponse> {
    const res = await this.post("/api/skills/publish/complete", params, token);
    const body = (await res.json()) as PushCompleteResponse;
    if (!res.ok) {
      throw new MarketplaceApiError(
        body.error || `Server error (${res.status})`,
        res.status,
        body,
      );
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
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createMarketplaceClient(
  serverOverride?: string,
): MarketplaceClient {
  const auth = loadAuth();
  const raw = serverOverride || auth?.serverUrl || loadConfig().serverUrl;
  return new MarketplaceClient(validateServerUrl(raw));
}
