// ============================================================
// QuickBooks OAuth 2.0 + OpenID Connect Client
// ============================================================
// Handles: authorization URL, token exchange, refresh, revoke,
// OpenID profile retrieval, and email verification check.

import OAuthClient from "intuit-oauth";
import { QBTokens, QBUserProfile } from "@/types";

// â”€â”€ Singleton OAuth Client â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

let oauthClient: OAuthClient | null = null;

export function getOAuthClient(): OAuthClient {
  if (oauthClient) return oauthClient;

  oauthClient = new OAuthClient({
    clientId: process.env.QB_CLIENT_ID!,
    clientSecret: process.env.QB_CLIENT_SECRET!,
    environment:
      process.env.QB_ENVIRONMENT === "production"
        ? "production"
        : "sandbox",
    redirectUri: process.env.QB_REDIRECT_URI!,
    logging: process.env.NODE_ENV === "development",
  });

  return oauthClient;
}

// â”€â”€ Authorization URL â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function getAuthorizationUrl(state: string): string {
  const client = getOAuthClient();

  return client.authorizeUri({
    scope: [
      OAuthClient.scopes.Accounting,
      OAuthClient.scopes.OpenId,
      OAuthClient.scopes.Email,
      OAuthClient.scopes.Profile,
    ],
    state,
  });
}

// â”€â”€ Token Exchange â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function exchangeCodeForTokens(
  url: string
): Promise<QBTokens> {
  const client = getOAuthClient();
  const response = await client.createToken(url);
  const token = response.getJson();

  return {
    access_token: token.access_token,
    refresh_token: token.refresh_token,
    token_type: token.token_type,
    expires_in: token.expires_in,
    x_refresh_token_expires_in: token.x_refresh_token_expires_in,
    id_token: token.id_token,
    created_at: Date.now(),
    realm_id: client.getToken().realmId!,
  };
}

// â”€â”€ Token Refresh â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function refreshAccessToken(
  refreshToken: string
): Promise<QBTokens> {
  const client = getOAuthClient();

  // Set the refresh token on the client
  client.setToken({
    refresh_token: refreshToken,
    access_token: "", // will be refreshed
    token_type: "bearer",
    expires_in: 0,
    x_refresh_token_expires_in: 0,
    realmId: "",
  });

  const response = await client.refresh();
  const token = response.getJson();

  return {
    access_token: token.access_token,
    refresh_token: token.refresh_token,
    token_type: token.token_type,
    expires_in: token.expires_in,
    x_refresh_token_expires_in: token.x_refresh_token_expires_in,
    created_at: Date.now(),
    realm_id: client.getToken().realmId || "",
  };
}

// â”€â”€ Token Revocation (disconnect) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function revokeToken(accessToken: string): Promise<void> {
  const client = getOAuthClient();

  client.setToken({
    access_token: accessToken,
    refresh_token: "",
    token_type: "bearer",
    expires_in: 3600,
    x_refresh_token_expires_in: 0,
    realmId: "",
  });

  await client.revoke({ access_token: accessToken });
}

// â”€â”€ OpenID Connect: Get User Profile â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function getUserProfile(
  accessToken: string
): Promise<QBUserProfile> {
  const client = getOAuthClient();

  client.setToken({
    access_token: accessToken,
    refresh_token: "",
    token_type: "bearer",
    expires_in: 3600,
    x_refresh_token_expires_in: 0,
    realmId: "",
  });

  const response = await client.getUserInfo();
  const userInfo = response.getJson();

  return {
    sub: userInfo.sub,
    email: userInfo.email,
    emailVerified: userInfo.emailVerified === true || userInfo.emailVerified === "true",
    givenName: userInfo.givenName || "",
    familyName: userInfo.familyName || "",
    phoneNumber: userInfo.phoneNumber,
  };
}

// â”€â”€ Check if token is expired â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function isTokenExpired(tokens: QBTokens): boolean {
  const expiresAt = tokens.created_at + tokens.expires_in * 1000;
  // Consider expired 5 minutes early for safety
  return Date.now() > expiresAt - 5 * 60 * 1000;
}

// â”€â”€ Check if refresh token is expired â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function isRefreshTokenExpired(tokens: QBTokens): boolean {
  const expiresAt =
    tokens.created_at + tokens.x_refresh_token_expires_in * 1000;
  // Consider expired 1 day early for safety
  return Date.now() > expiresAt - 24 * 60 * 60 * 1000;
}

