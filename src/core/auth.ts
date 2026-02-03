import { existsSync, readFileSync, writeFileSync, unlinkSync, renameSync } from "fs";
import { join } from "path";
import { getConfigDir, ensureConfigDir } from "./config.js";

export interface AuthData {
  accessToken: string;
  refreshToken: string;
  serverUrl: string;
  user?: {
    id: string;
    name: string;
    email: string;
  };
  expiresAt?: string;
  refreshExpiresAt?: string;
  createdAt: string;
}

function getAuthPath(): string {
  return join(getConfigDir(), "auth.json");
}

export function loadAuth(): AuthData | null {
  const authPath = getAuthPath();
  if (!existsSync(authPath)) {
    return null;
  }

  try {
    const content = readFileSync(authPath, "utf-8");
    const data = JSON.parse(content) as AuthData;

    // Session is expired only when the refresh token is expired
    if (data.refreshExpiresAt && new Date(data.refreshExpiresAt) < new Date()) {
      clearAuth();
      return null;
    }

    return data;
  } catch {
    return null;
  }
}

export function saveAuth(data: AuthData): void {
  ensureConfigDir();
  const authPath = getAuthPath();
  const tempPath = `${authPath}.tmp`;
  writeFileSync(tempPath, JSON.stringify(data, null, 2), { encoding: "utf-8", mode: 0o600 });
  renameSync(tempPath, authPath);
}

export function clearAuth(): void {
  const authPath = getAuthPath();
  if (existsSync(authPath)) {
    unlinkSync(authPath);
  }
}
