import type { LoaderFunctionArgs } from "react-router";
import {
  getEnv,
  getSessionSecret,
  getJoeAuthIssuer,
  isHttpsRequest,
  generateRandomBase64Url,
  computeS256Challenge,
  createOAuthTxCookieValue,
  serializeOAuthTxCookie,
} from "~/utils/auth.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const env = getEnv();
  const issuer = getJoeAuthIssuer(env);
  const clientId = (env.JOEAUTH_CLIENT_ID || "").trim();

  if (!clientId) {
    const err = encodeURIComponent(
      "JoeAuth is not configured yet (missing JOEAUTH_CLIENT_ID)."
    );
    return Response.redirect(new URL(`/?auth_error=${err}`, request.url).toString(), 302);
  }

  const secret = getSessionSecret(env);
  const state = generateRandomBase64Url(24);
  const nonce = generateRandomBase64Url(24);
  const codeVerifier = generateRandomBase64Url(48);
  const codeChallenge = await computeS256Challenge(codeVerifier);

  const txCookieVal = await createOAuthTxCookieValue(
    { state, codeVerifier, nonce },
    secret
  );

  const reqOrigin = new URL(request.url).origin;
  const redirectUri = `${reqOrigin}/auth/callback`;

  const authUrl = new URL(`${issuer}/oauth/authorize`);
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "openid profile email");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("nonce", nonce);
  authUrl.searchParams.set("code_challenge", codeChallenge);
  authUrl.searchParams.set("code_challenge_method", "S256");

  return new Response(null, {
    status: 302,
    headers: {
      Location: authUrl.toString(),
      "Set-Cookie": serializeOAuthTxCookie(txCookieVal, isHttpsRequest(request)),
    },
  });
}
