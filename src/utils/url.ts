/**
 * Validate and normalize a server URL.
 * Ensures the URL uses http: or https: protocol and strips trailing slashes.
 */
export function validateServerUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error(`Unsupported protocol: ${parsed.protocol}`);
    }
    return parsed.origin;
  } catch (err) {
    if (err instanceof TypeError) {
      throw new Error(`Invalid server URL: ${url}`);
    }
    throw err;
  }
}

/**
 * Build a URL-safe API path with encoded slug.
 * Prevents path injection through slug values.
 */
export function skillApiPath(slug: string, ...segments: string[]): string {
  if (!slug) throw new Error("Slug cannot be empty");
  const encoded = encodeURIComponent(slug);
  const suffix = segments.length > 0 ? `/${segments.join("/")}` : "";
  return `/api/skills/${encoded}${suffix}`;
}
