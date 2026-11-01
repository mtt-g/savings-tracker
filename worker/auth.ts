import { createMiddleware } from "hono/factory";
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { AppEnv } from "./types";

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

/**
 * Checks the Cloudflare Access token on every API request.
 *
 * Cloudflare Access puts a login page in front of the app and adds a signed JWT to each request it
 * lets through. Verifying it here means the API stays locked even if the Access application is
 * misconfigured or someone finds another route to the Worker. If Access isn't configured, the API
 * refuses all requests (except in local development).
 */
export const requireAccess = createMiddleware<AppEnv>(async (c, next) => {
  if (c.env.ENVIRONMENT === "development") return next();

  const teamDomain: string = c.env.ACCESS_TEAM_DOMAIN;
  const aud: string = c.env.ACCESS_AUD;
  if (!teamDomain || !aud) {
    return c.json({ error: "Cloudflare Access is not configured. Set ACCESS_TEAM_DOMAIN and ACCESS_AUD." }, 503);
  }

  const token = c.req.header("Cf-Access-Jwt-Assertion");
  if (!token) return c.json({ error: "Unauthorised" }, 401);

  const issuer = teamDomain.startsWith("https://") ? teamDomain : `https://${teamDomain}`;
  let jwks = jwksCache.get(issuer);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
    jwksCache.set(issuer, jwks);
  }
  try {
    const { payload } = await jwtVerify(token, jwks, { issuer, audience: aud });
    c.set("userEmail", typeof payload.email === "string" ? payload.email : null);
  } catch {
    return c.json({ error: "Unauthorised" }, 401);
  }
  return next();
});
