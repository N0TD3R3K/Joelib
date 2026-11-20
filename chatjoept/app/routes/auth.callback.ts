import type { LoaderFunctionArgs } from "react-router";
import {
  getEnv,
  getSessionSecret,
  getJoeAuthIssuer,
  isHttpsRequest,
  verifyOAuthTxCookie,
  clearOAuthTxCookie,
  verifyJoeAuthIdToken,
  createSessionToken,
  serializeSessionCookie,
} from "~/utils/auth.server";
import { upsertUser } from "~/utils/db.server";

function redirectWithError(requestUrl: string, message: string, isHttps: boolean) {
  const target = new URL("/", requestUrl);
  target.searchParams.set("auth_error", message);
  return new Response(null, {
    status: 302,
    headers: {
      Location: target.toString(),
      "Set-Cookie": clearOAuthTxCookie(isHttps),
    },
  });
}

export async function loader({ request }: LoaderFunctionArgs) {
  const env = getEnv();
  const isHttps = isHttpsRequest(request);
  const url = new URL(request.url);

  const oauthError = url.searchParams.get("error");
  if (oauthError) {
    const desc = url.searchParams.get("error_description") || oauthError;
    return redirectWithError(request.url, `JoeAuth sign-in declined: ${desc}`, isHttps);
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) {
    return redirectWithError(request.url, "Missing authorization code or state.", isHttps);
  }

  const secret = getSessionSecret(env);
  const tx = await verifyOAuthTxCookie(request, secret);
  if (!tx || tx.state !== state) {
    return redirectWithError(
      request.url,
      "Invalid or expired authentication state. Please try again.",
      isHttps
    );
  }

  const issuer = getJoeAuthIssuer(env);
  const clientId = (env.JOEAUTH_CLIENT_ID || "").trim();
  const clientSecret = (env.JOEAUTH_CLIENT_SECRET || "").trim();

  if (!clientId) {
    return redirectWithError(request.url, "JoeAuth client ID is not configured.", isHttps);
  }

  const redirectUri = `${url.origin}/auth/callback`;
  const tokenParams = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: clientId,
    code,
    redirect_uri: redirectUri,
    code_verifier: tx.codeVerifier,
  });

  if (clientSecret) {
    tokenParams.set("client_secret", clientSecret);
  }

  let tokenData: any;
  try {
    const tokenRes = await fetch(`${issuer}/api/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: tokenParams,
    });
    tokenData = await tokenRes.json().catch(() => ({}));
    if (!tokenRes.ok || !tokenData.access_token) {
      const reason = tokenData?.error_description || tokenData?.error || `HTTP ${tokenRes.status}`;
      return redirectWithError(request.url, `Token exchange failed: ${reason}`, isHttps);
    }
  } catch (err: any) {
    return redirectWithError(
      request.url,
      `Could not contact JoeAuth token endpoint: ${err?.message || "network error"}`,
      isHttps
    );
  }

  let sub = "";
  let email = "";
  let name: string | undefined;
  let picture: string | undefined;

  if (tokenData.id_token) {
    try {
      const claims = await verifyJoeAuthIdToken(tokenData.id_token, {
        issuer,
        clientId,
        expectedNonce: tx.nonce,
      });
      sub = claims.sub;
      email = claims.email || "";
      name = claims.name;
      picture = claims.picture;
    } catch (err: any) {
      return redirectWithError(
        request.url,
        `ID token verification failed: ${err?.message || "invalid token"}`,
        isHttps
      );
    }
  }

  // Fallback or supplement missing email/profile from /api/oauth/userinfo
  if (!sub || !email) {
    try {
      const uiRes = await fetch(`${issuer}/api/oauth/userinfo`, {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      if (uiRes.ok) {
        const uiData = (await uiRes.json()) as any;
        sub = sub || uiData.sub || "";
        email = email || uiData.email || "";
        name = name || uiData.name;
        picture = picture || uiData.picture;
      }
    } catch {
      // Non-fatal if claims already sufficient
    }
  }

  if (!sub) {
    return redirectWithError(request.url, "JoeAuth response did not include user ID.", isHttps);
  }

  const userEmail = email || `${sub}@joe-univer.se`;
  await upsertUser({ sub, email: userEmail, name, picture }, env);

  const sessionToken = await createSessionToken(
    { sub, email: userEmail, name, picture },
    secret
  );

  const headers = new Headers({ Location: new URL("/", request.url).toString() });
  headers.append("Set-Cookie", clearOAuthTxCookie(isHttps));
  headers.append("Set-Cookie", serializeSessionCookie(sessionToken, isHttps));

  return new Response(null, { status: 302, headers });
}
