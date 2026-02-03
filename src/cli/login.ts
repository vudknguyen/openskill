import { Command } from "commander";
import { execFile } from "child_process";
import { platform } from "os";
import { logger, createSpinner } from "../utils/logger.js";
import { loadAuth, saveAuth, type AuthData } from "../core/auth.js";
import { loadConfig } from "../core/config.js";

interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete: string;
  expires_in: number;
  interval: number;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

interface TokenErrorResponse {
  error: string;
}

interface MeResponse {
  user: {
    id: string;
    name: string;
    email: string;
  };
}

function openBrowser(url: string): void {
  // Validate URL format to prevent command injection
  try {
    new URL(url);
  } catch {
    return;
  }

  const os = platform();
  if (os === "darwin") {
    execFile("open", [url], () => {});
  } else if (os === "win32") {
    // Use empty title arg to prevent injection via cmd /c start
    execFile("cmd", ["/c", "start", "", url], () => {});
  } else {
    execFile("xdg-open", [url], () => {});
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestDeviceCode(
  serverUrl: string
): Promise<DeviceCodeResponse> {
  const res = await fetch(`${serverUrl}/api/auth/device/code`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_info: `osk/0.1.0 ${platform()}`,
    }),
  });

  if (!res.ok) {
    throw new Error(`Server returned ${res.status}`);
  }

  return (await res.json()) as DeviceCodeResponse;
}

async function pollForToken(
  serverUrl: string,
  deviceCode: string,
  interval: number,
  expiresIn: number
): Promise<TokenResponse> {
  const deadline = Date.now() + expiresIn * 1000;

  while (Date.now() < deadline) {
    await sleep(interval * 1000);

    const res = await fetch(`${serverUrl}/api/auth/device/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ device_code: deviceCode }),
    });

    const body = (await res.json()) as TokenResponse | TokenErrorResponse;

    if (res.ok && "access_token" in body) {
      return body;
    }

    if ("error" in body) {
      if (body.error === "authorization_pending") {
        continue;
      }
      if (body.error === "slow_down") {
        interval += 5;
        continue;
      }
      throw new Error(body.error);
    }
  }

  throw new Error("expired_token");
}

async function fetchUser(
  serverUrl: string,
  token: string
): Promise<MeResponse["user"]> {
  const res = await fetch(`${serverUrl}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch user (${res.status})`);
  }

  const body = (await res.json()) as MeResponse;
  return body.user;
}

export const loginCommand = new Command("login")
  .description("Authenticate with the OpenSkill marketplace")
  .option("-s, --server <url>", "Server URL", loadConfig().serverUrl)
  .option("--no-browser", "Don't open browser automatically")
  .addHelpText(
    "after",
    `
Examples:
  $ osk login
  $ osk login --server https://openskill.example.com
  $ osk login --no-browser`
  )
  .action(async (options: { server: string; browser: boolean }) => {
    const serverUrl = options.server.replace(/\/$/, "");

    // Check existing auth
    const existing = loadAuth();
    if (existing && existing.serverUrl === serverUrl) {
      logger.info(
        `Already logged in as ${existing.user?.name ?? existing.user?.email ?? "unknown"}`
      );
      logger.dim("Run 'osk logout' first to switch accounts.");
      return;
    }

    // Step 1: Request device code
    let deviceData: DeviceCodeResponse;
    try {
      deviceData = await requestDeviceCode(serverUrl);
    } catch (err) {
      logger.error(
        `Failed to connect to ${serverUrl}: ${err instanceof Error ? err.message : "Unknown error"}`
      );
      return;
    }

    // Step 2: Show code and open browser
    logger.newline();
    logger.log(`  Your code: \x1b[1m\x1b[4m${deviceData.user_code}\x1b[0m`);
    logger.newline();
    logger.dim(`  Open: ${deviceData.verification_uri_complete}`);
    logger.newline();

    if (options.browser) {
      // Validate URL origin matches server to prevent phishing redirects
      try {
        const verifyUrl = new URL(deviceData.verification_uri_complete);
        const serverOrigin = new URL(serverUrl);
        if (verifyUrl.origin !== serverOrigin.origin) {
          logger.error("Server returned a verification URL with a different origin. Aborting.");
          return;
        }
      } catch {
        logger.error("Server returned an invalid verification URL.");
        return;
      }
      openBrowser(deviceData.verification_uri_complete);
      logger.dim("  Browser opened. Approve the device to continue.");
    } else {
      logger.dim(
        "  Open the URL above in your browser and approve the device."
      );
    }
    logger.newline();

    // Step 3: Poll for token
    const spinner = createSpinner("Waiting for approval...");
    try {
      const tokenData = await pollForToken(
        serverUrl,
        deviceData.device_code,
        deviceData.interval,
        deviceData.expires_in
      );
      spinner.stop("Approved");

      // Step 4: Fetch user info
      const user = await fetchUser(serverUrl, tokenData.access_token);

      // Step 5: Save auth (access token expires in expires_in seconds, refresh in 90 days)
      const expiresAt = new Date(
        Date.now() + tokenData.expires_in * 1000
      ).toISOString();
      const refreshExpiresAt = new Date(
        Date.now() + 90 * 24 * 60 * 60 * 1000
      ).toISOString();

      const authData: AuthData = {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        serverUrl,
        user: { id: user.id, name: user.name, email: user.email },
        expiresAt,
        refreshExpiresAt,
        createdAt: new Date().toISOString(),
      };
      saveAuth(authData);

      logger.success(`Logged in as ${user.name} (${user.email})`);
    } catch (err) {
      spinner.stop();
      const msg = err instanceof Error ? err.message : "Unknown error";

      if (msg === "access_denied") {
        logger.error("Authorization was denied.");
      } else if (msg === "expired_token") {
        logger.error("Device code expired. Run 'osk login' to try again.");
      } else {
        logger.error(`Login failed: ${msg}`);
      }
    }
  });
