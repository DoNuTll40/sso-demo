import { NextResponse } from "next/server";

const CORS_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Cache-Control": "public, max-age=3600",
};

export async function GET() {
  const baseUrl = (
    process.env.NEXT_PUBLIC_APP_URL
  ).replace(/\/$/, "");

  const metadata = {
    issuer: `${baseUrl}`,
    authorization_endpoint: `${baseUrl}/api/v1/oauth/authorize`,
    token_endpoint: `${baseUrl}/api/v1/oauth/token`,
    userinfo_endpoint: `${baseUrl}/api/v1/oauth/userinfo`,
    jwks_uri: `${baseUrl}/.well-known/jwks.json`,
    response_types_supported: ["code"],
    subject_types_supported: ["public"],
    id_token_signing_alg_values_supported: ["HS256"],
    scopes_supported: ["openid", "profile", "email"],
    token_endpoint_auth_methods_supported: [
      "client_secret_basic",
      "client_secret_post",
      "none",
    ],
    claims_supported: [
      "sub",
      "name",
      "preferred_username",
      "email",
      "email_verified",
      "role",
      "picture",
      "updated_at",
    ],
    code_challenge_methods_supported: ["S256"],
  };

  return NextResponse.json(metadata, {
    status: 200,
    headers: CORS_HEADERS,
  });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

