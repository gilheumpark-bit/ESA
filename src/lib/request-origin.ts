/**
 * CSRF origin policy for browser POST requests.
 *
 * The request's own origin is the primary source of truth. This avoids both
 * hard-coded port failures and broad preview-domain wildcards. Additional
 * cross-origins must be listed exactly in NEXT_PUBLIC_ALLOWED_ORIGINS.
 */
export function isRequestOriginAllowed(
  origin: string | null,
  requestUrl: string,
  configuredOrigins: string = process.env.NEXT_PUBLIC_ALLOWED_ORIGINS ?? '',
  requestHost?: string | null,
  forwardedProtocol?: string | null,
): boolean {
  // Non-browser/server-to-server requests do not carry Origin. Authentication
  // and endpoint-specific shared secrets remain their authorization boundary.
  if (!origin) return true;

  let incomingOrigin: string;
  let servingOrigin: string;
  try {
    const parsedIncoming = new URL(origin);
    const parsedRequest = new URL(requestUrl);
    // Browsers send a serialized origin, never a path, query, or fragment.
    if (origin !== parsedIncoming.origin) return false;
    incomingOrigin = parsedIncoming.origin;
    servingOrigin = parsedRequest.origin;
  } catch {
    return false;
  }

  if (incomingOrigin === servingOrigin) return true;

  // `next start` and some reverse proxies canonicalize request.url to an
  // internal hostname. The browser-facing Host header still represents the
  // URL a browser was able to use, so accept an exact protocol+host match.
  const normalizedHost = requestHost?.trim().toLowerCase() ?? '';
  if (
    normalizedHost
    && normalizedHost.length <= 255
    && /^[a-z0-9.\-:[\]]+$/.test(normalizedHost)
  ) {
    const forwarded = forwardedProtocol?.split(',')[0]?.trim().toLowerCase();
    const protocol = forwarded === 'http' || forwarded === 'https'
      ? `${forwarded}:`
      : new URL(requestUrl).protocol;
    try {
      if (new URL(`${protocol}//${normalizedHost}`).origin === incomingOrigin) {
        return true;
      }
    } catch {
      // Invalid Host remains rejected unless explicitly configured below.
    }
  }

  return configuredOrigins
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .some((entry) => {
      try {
        return new URL(entry).origin === incomingOrigin;
      } catch {
        return false;
      }
    });
}
