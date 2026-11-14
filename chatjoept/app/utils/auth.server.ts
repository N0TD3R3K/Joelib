// Server-side JoeAuth OIDC + PKCE + Session Authentication Utilities

const DEFAULT_SECRET = "chatjoept-default-secret-salt-2026";
export const DEFAULT_JOEAUTH_ISSUER = "https://auth.joe-univer.se";

export interface SessionPayload {
  sub: string;
  email: string;
  name?: string;
  picture?: string;
  exp: number;
}

export interface OAuthTxPayload {
  state: string;
  codeVerifier: string;
  nonce: string;
  exp: number;
}

export function getEnv(): Record<string, any> {
  const g = globalThis as any;
  if (g.__CF_ENV__) return g.__CF_ENV__;
  if (g.process && g.process.env) return g.process.env;
  return {};
}

export function getSessionSecret(env?: Record<string, any>): string {
  const e = env || getEnv();
  return (e.SESSION_SECRET || DEFAULT_SECRET).trim() || DEFAULT_SECRET;
}

export function getJoeAuthIssuer(env?: Record<string, any>): string {
  const e = env || getEnv();
  return (e.JOEAUTH_ISSUER || DEFAULT_JOEAUTH_ISSUER).trim().replace(/\/+$/, "");
}

export function isHttpsRequest(request: Request): boolean {
  const proto = request.headers.get("x-forwarded-proto");
  if (proto) return proto.toLowerCase().includes("https");
  try {
    return new URL(request.url).protocol === "https:";
  } catch {
    return false;
  }
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(str: string): Uint8Array<ArrayBuffer> {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((str.length + 3) % 4);
  const binary = atob(padded);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function generateRandomBase64Url(numBytes = 32): string {
  const bytes = new Uint8Array(numBytes);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

export async function computeS256Challenge(codeVerifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(codeVerifier)
  );
  return base64UrlEncode(new Uint8Array(digest));
}

async function getHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret || DEFAULT_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

async function signSignedJson<T extends object>(payload: T, secret: string): Promise<string> {
  const jsonBytes = new TextEncoder().encode(JSON.stringify(payload));
  const payloadB64 = base64UrlEncode(jsonBytes);
  const key = await getHmacKey(secret);
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payloadB64)
  );
  return `${payloadB64}.${base64UrlEncode(new Uint8Array(sig))}`;
}

async function verifySignedJson<T extends { exp?: number }>(
  token: string | null | undefined,
  secret: string
): Promise<T | null> {
  if (!token) return null;
  const dotIdx = token.indexOf(".");
  if (dotIdx <= 0) return null;

  const payloadB64 = token.slice(0, dotIdx);
  const sigB64 = token.slice(dotIdx + 1);
  if (!sigB64) return null;

  try {
    const key = await getHmacKey(secret);
    const sigBytes = base64UrlDecode(sigB64);
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      sigBytes,
      new TextEncoder().encode(payloadB64)
    );
    if (!valid) return null;

    const json = new TextDecoder().decode(base64UrlDecode(payloadB64));
    const parsed = JSON.parse(json) as T;
    if (parsed.exp && Date.now() > parsed.exp) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function parseCookieValue(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  const prefix = `${name}=`;
  const parts = cookieHeader.split(";").map((c) => c.trim());
  for (const part of parts) {
    if (part.startsWith(prefix)) {
      return decodeURIComponent(part.slice(prefix.length));
    }
  }
  return null;
}

// -------------------------------------------------------------
// Session Cookie Helpers
// -------------------------------------------------------------

export const SESSION_COOKIE_NAME = "chatjoept_session";
export const OAUTH_TX_COOKIE_NAME = "chatjoept_oauth_tx";

export async function createSessionToken(
  user: Omit<SessionPayload, "exp">,
  secret: string
): Promise<string> {
  const payload: SessionPayload = {
    ...user,
    exp: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days
  };
  return signSignedJson(payload, secret);
}

export async function verifySessionToken(
  token: string | null | undefined,
  secret: string
): Promise<SessionPayload | null> {
  const payload = await verifySignedJson<SessionPayload>(token, secret);
  if (!payload || !payload.sub || !payload.email) return null;
  return payload;
}

export async function getAuthenticatedUser(
  request: Request,
  env?: Record<string, any>
): Promise<SessionPayload | null> {
  const secret = getSessionSecret(env);
  const token = parseCookieValue(request.headers.get("Cookie"), SESSION_COOKIE_NAME);
  return verifySessionToken(token, secret);
}

export function serializeSessionCookie(
  token: string,
  isHttps: boolean,
  maxAge = 30 * 24 * 60 * 60
): string {
  const secureAttr = isHttps ? "; Secure" : "";
  return `${SESSION_COOKIE_NAME}=${encodeURIComponent(
    token
  )}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secureAttr}`;
}

export function clearSessionCookie(isHttps: boolean): string {
  const secureAttr = isHttps ? "; Secure" : "";
  return `${SESSION_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secureAttr}`;
}

// -------------------------------------------------------------
// OAuth PKCE Transaction Cookie Helpers
// -------------------------------------------------------------

export async function createOAuthTxCookieValue(
  tx: Omit<OAuthTxPayload, "exp">,
  secret: string
): Promise<string> {
  return signSignedJson(
    { ...tx, exp: Date.now() + 10 * 60 * 1000 }, // 10 minutes
    secret
  );
}

export async function verifyOAuthTxCookie(
  request: Request,
  secret: string
): Promise<OAuthTxPayload | null> {
  const token = parseCookieValue(request.headers.get("Cookie"), OAUTH_TX_COOKIE_NAME);
  return verifySignedJson<OAuthTxPayload>(token, secret);
}

export function serializeOAuthTxCookie(value: string, isHttps: boolean): string {
  const secureAttr = isHttps ? "; Secure" : "";
  return `${OAUTH_TX_COOKIE_NAME}=${encodeURIComponent(
    value
  )}; Path=/; Max-Age=600; HttpOnly; SameSite=Lax${secureAttr}`;
}

export function clearOAuthTxCookie(isHttps: boolean): string {
  const secureAttr = isHttps ? "; Secure" : "";
  return `${OAUTH_TX_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secureAttr}`;
}

// -------------------------------------------------------------
// JoeAuth OIDC Ed25519 JWKS Verification
// -------------------------------------------------------------

let cachedJwks: { issuer: string; keys: any[]; expiresAt: number } | null = null;

async function fetchJoeAuthJwks(issuer: string): Promise<any[]> {
  if (cachedJwks && cachedJwks.issuer === issuer && Date.now() < cachedJwks.expiresAt) {
    return cachedJwks.keys;
  }
  const resp = await fetch(`${issuer}/.well-known/jwks.json`);
  if (!resp.ok) {
    throw new Error(`Failed to fetch JoeAuth JWKS (${resp.status})`);
  }
  const data = (await resp.json()) as { keys?: any[] };
  const keys = Array.isArray(data?.keys) ? data.keys : [];
  cachedJwks = { issuer, keys, expiresAt: Date.now() + 5 * 60 * 1000 };
  return keys;
}

export interface VerifiedIdTokenClaims {
  sub: string;
  email?: string;
  name?: string;
  picture?: string;
  iss: string;
  aud: string | string[];
  nonce?: string;
  exp: number;
}

export async function verifyJoeAuthIdToken(
  idToken: string,
  options: { issuer: string; clientId: string; expectedNonce?: string }
): Promise<VerifiedIdTokenClaims> {
  const parts = idToken.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid ID token format");
  }

  const [headerB64, payloadB64, sigB64] = parts;
  const header = JSON.parse(new TextDecoder().decode(base64UrlDecode(headerB64)));
  if (header.alg !== "EdDSA") {
    throw new Error(`Unsupported ID token algorithm: ${header.alg}`);
  }

  const keys = await fetchJoeAuthJwks(options.issuer);
  if (keys.length === 0) {
    throw new Error("JoeAuth JWKS returned no public keys");
  }

  const candidateKeys = header.kid
    ? keys.filter((k) => k.kid === header.kid)
    : keys;
  const keysToTry = candidateKeys.length > 0 ? candidateKeys : keys;

  const sigBytes = base64UrlDecode(sigB64);
  const signedData = new TextEncoder().encode(`${headerB64}.${payloadB64}`);

  let signatureValid = false;
  for (const jwk of keysToTry) {
    try {
      const pubKey = await crypto.subtle.importKey(
        "jwk",
        jwk,
        { name: "Ed25519" },
        false,
        ["verify"]
      );
      if (await crypto.subtle.verify("Ed25519", pubKey, sigBytes, signedData)) {
        signatureValid = true;
        break;
      }
    } catch {
      // Try next key in JWKS
    }
  }

  if (!signatureValid) {
    throw new Error("Invalid ID token Ed25519 signature");
  }

  const claims = JSON.parse(
    new TextDecoder().decode(base64UrlDecode(payloadB64))
  ) as VerifiedIdTokenClaims;

  const nowSec = Math.floor(Date.now() / 1000);
  if (typeof claims.exp !== "number" || claims.exp < nowSec - 30) {
    throw new Error("ID token expired");
  }
  if (claims.iss !== options.issuer) {
    throw new Error("ID token issuer mismatch");
  }
  const audValid = Array.isArray(claims.aud)
    ? claims.aud.includes(options.clientId)
    : claims.aud === options.clientId;
  if (!audValid) {
    throw new Error("ID token audience mismatch");
  }
  if (options.expectedNonce && claims.nonce !== options.expectedNonce) {
    throw new Error("ID token nonce mismatch");
  }
  if (!claims.sub) {
    throw new Error("ID token missing sub claim");
  }

  return claims;
}
