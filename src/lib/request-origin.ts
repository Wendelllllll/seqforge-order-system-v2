export function hasTrustedRequestOrigin(request: Request, configuredBaseURL = process.env.BETTER_AUTH_URL) {
  const origin = request.headers.get("origin");
  if (!origin || origin === "null") return false;

  try {
    // Behind a reverse proxy, request.url can contain the internal listening host.
    // The configured public URL is authoritative; forwarded headers are not.
    const base = new URL(configuredBaseURL || request.url);
    if (!["http:", "https:"].includes(base.protocol) || base.username || base.password) return false;
    return origin === base.origin;
  } catch {
    return false;
  }
}
