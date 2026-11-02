import { userPreferences } from "@/lib/user-preferences";
import { NextResponse } from "next/server";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";
import { getRequestContext, recordAuditAndSessionLog } from "@/lib/audit";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
  Pragma: "no-cache",
};

/**
 * คำนวณค่า BASE64URL-ENCODE(SHA256(ASCII(code_verifier))) ตามมาตรฐาน RFC 7636 (PKCE)
 */
function generateCodeChallengeS256(codeVerifier) {
  return crypto
    .createHash("sha256")
    .update(codeVerifier)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * รองรับการดึง Client Credentials จาก Authorization: Basic <base64(client_id:client_secret)>
 */
function extractBasicAuthCredentials(request) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Basic ")) {
    return null;
  }

  try {
    const base64Credentials = authHeader.slice(6).trim();
    const decoded = Buffer.from(base64Credentials, "base64").toString("utf-8");
    const colonIndex = decoded.indexOf(":");
    if (colonIndex === -1) return null;

    return {
      clientId: decodeURIComponent(decoded.slice(0, colonIndex)),
      clientSecret: decodeURIComponent(decoded.slice(colonIndex + 1)),
    };
  } catch {
    return null;
  }
}

/**
 * รองรับการอ่านพารามิเตอร์ทั้งจาก application/x-www-form-urlencoded และ application/json
 */
async function parseTokenRequestBody(request) {
  const contentType = (request.headers.get("content-type") || "").toLowerCase();

  if (contentType.includes("application/x-www-form-urlencoded")) {
    const text = await request.text();
    const params = new URLSearchParams(text);
    return Object.fromEntries(params.entries());
  }

  if (contentType.includes("application/json")) {
    return await request.json();
  }

  // Fallback กรณีไม่ได้ระบุ Content-Type ชัดเจน
  const rawText = await request.text();
  if (!rawText) return {};

  try {
    return JSON.parse(rawText);
  } catch {
    const params = new URLSearchParams(rawText);
    return Object.fromEntries(params.entries());
  }
}

/**
 * ตรวจสอบความถูกต้องของ client_secret (รองรับทั้งแบบ Bcrypt Hash และ Plaintext)
 */
async function verifyClientSecret(providedSecret, storedSecret) {
  if (!providedSecret || !storedSecret) return false;
  if (storedSecret.startsWith("$2")) {
    return await bcrypt.compare(providedSecret, storedSecret);
  }
  return providedSecret === storedSecret;
}

/**
 * จัดการ Flow สำหรับ grant_type=authorization_code
 */
async function handleAuthorizationCodeGrant({
  request,
  body,
  basicAuth,
  ctx,
  startTime,
}) {
  const code = body.code;
  const redirectUri = body.redirect_uri;
  const clientId = body.client_id || basicAuth?.clientId;
  const clientSecret = body.client_secret || basicAuth?.clientSecret;
  const codeVerifier = body.code_verifier;

  if (!code || !redirectUri || !clientId) {
    return NextResponse.json(
      {
        error: "invalid_request",
        error_description: "Missing required parameters: code, redirect_uri, or client_id",
      },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  // ค้นหา AuthSession จาก authorizationCode พร้อมข้อมูล User และ OAuthClient
  const authSession = await prisma.authSession.findUnique({
    where: { authorizationCode: code },
    include: {
      client: true,
      user: true,
    },
  });

  if (!authSession || !authSession.user) {
    await recordAuditAndSessionLog({
      request,
      action: "OAUTH_TOKEN_INVALID_GRANT",
      eventType: "TOKEN_EXCHANGE_FAILED",
      category: "SECURITY",
      status: "FAILURE",
      severity: "HIGH",
      statusCode: 400,
      responseTimeMs: Date.now() - startTime,
      reason: "Invalid authorization code or missing user in session",
      metadata: { clientId, redirectUri },
    });

    return NextResponse.json(
      {
        error: "invalid_grant",
        error_description: "Invalid or already used authorization code",
      },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  // ตรวจสอบสถานะและวันหมดอายุของ AuthSession
  if (
    authSession.status !== "APPROVED" ||
    new Date() > new Date(authSession.expiresAt)
  ) {
    await recordAuditAndSessionLog({
      request,
      userId: authSession.userId,
      clientId: authSession.clientId,
      authSessionId: authSession.id,
      action: "OAUTH_TOKEN_EXPIRED_OR_UNAPPROVED_SESSION",
      eventType: "TOKEN_EXCHANGE_FAILED",
      category: "SECURITY",
      status: "FAILURE",
      severity: "HIGH",
      statusCode: 400,
      responseTimeMs: Date.now() - startTime,
      reason: `Session status=${authSession.status}, expiresAt=${authSession.expiresAt.toISOString()}`,
    });

    return NextResponse.json(
      {
        error: "invalid_grant",
        error_description: "Authorization session is expired or not approved",
      },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  // ตรวจสอบ client_id และ redirect_uri ให้ตรงกับ Session เดิม
  if (
    authSession.client.clientId !== clientId ||
    authSession.redirectUri !== redirectUri
  ) {
    await recordAuditAndSessionLog({
      request,
      userId: authSession.userId,
      clientId: authSession.clientId,
      authSessionId: authSession.id,
      action: "OAUTH_TOKEN_CLIENT_MISMATCH",
      eventType: "TOKEN_EXCHANGE_FAILED",
      category: "SECURITY",
      status: "FAILURE",
      severity: "CRITICAL",
      statusCode: 400,
      responseTimeMs: Date.now() - startTime,
      reason: "client_id or redirect_uri mismatch with original AuthSession",
      metadata: {
        requestedClientId: clientId,
        requestedRedirectUri: redirectUri,
      },
    });

    return NextResponse.json(
      {
        error: "invalid_grant",
        error_description: "client_id or redirect_uri does not match original session",
      },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  // กรณี Confidential Client ต้อง Verify client_secret
  if (!authSession.client.isPublic && authSession.client.clientSecret) {
    const isSecretValid = await verifyClientSecret(
      clientSecret,
      authSession.client.clientSecret
    );

    if (!isSecretValid) {
      await recordAuditAndSessionLog({
        request,
        userId: authSession.userId,
        clientId: authSession.clientId,
        authSessionId: authSession.id,
        action: "OAUTH_TOKEN_INVALID_CLIENT_SECRET",
        eventType: "TOKEN_EXCHANGE_FAILED",
        category: "SECURITY",
        status: "FAILURE",
        severity: "CRITICAL",
        statusCode: 401,
        responseTimeMs: Date.now() - startTime,
        reason: "Invalid or missing client_secret",
      });

      return NextResponse.json(
        {
          error: "invalid_client",
          error_description: "Invalid client credentials",
        },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }
  }

  // ตรวจสอบ PKCE (code_verifier เทียบกับ code_challenge)
  if (authSession.codeChallenge) {
    if (!codeVerifier) {
      await recordAuditAndSessionLog({
        request,
        userId: authSession.userId,
        clientId: authSession.clientId,
        authSessionId: authSession.id,
        action: "OAUTH_TOKEN_MISSING_CODE_VERIFIER",
        eventType: "TOKEN_EXCHANGE_FAILED",
        category: "SECURITY",
        status: "FAILURE",
        severity: "HIGH",
        statusCode: 400,
        responseTimeMs: Date.now() - startTime,
        reason: "Missing PKCE code_verifier",
      });

      return NextResponse.json(
        {
          error: "invalid_grant",
          error_description: "Missing code_verifier for PKCE verification",
        },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const method = (authSession.codeChallengeMethod || "S256").toUpperCase();
    const computedChallenge =
      method === "S256"
        ? generateCodeChallengeS256(codeVerifier)
        : codeVerifier;

    if (computedChallenge !== authSession.codeChallenge) {
      await recordAuditAndSessionLog({
        request,
        userId: authSession.userId,
        clientId: authSession.clientId,
        authSessionId: authSession.id,
        action: "OAUTH_TOKEN_PKCE_VERIFICATION_FAILED",
        eventType: "TOKEN_EXCHANGE_FAILED",
        category: "SECURITY",
        status: "FAILURE",
        severity: "CRITICAL",
        statusCode: 400,
        responseTimeMs: Date.now() - startTime,
        reason: "PKCE code_verifier does not match code_challenge",
        metadata: { method },
      });

      return NextResponse.json(
        {
          error: "invalid_grant",
          error_description: "PKCE verification failed",
        },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }
  }

  // ออก Access Token (JWT), ID Token (OIDC standard) และ Refresh Token
  const jwtSecret = process.env.JWT_SECRET;
  const issuer = process.env.NEXT_PUBLIC_APP_URL;
  const expiresInSeconds = (await userPreferences(authSession.userId)).accessTokenTtl;
  const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);
  const user = authSession.user;

  const accessToken = jwt.sign(
    {
      sub: user.id,
      client_id: authSession.client.clientId,
      scope: authSession.scope,
      role: user.role,
      jti: crypto.randomUUID(),
    },
    jwtSecret,
    {
      expiresIn: expiresInSeconds,
      issuer,
      audience: authSession.client.clientId,
    }
  );

  const idToken = jwt.sign(
    {
      iss: issuer,
      sub: user.id,
      aud: authSession.client.clientId,
      preferred_username: user.username,
      email: user.email,
      name: user.fullName,
      picture: user.avatarUrl || undefined,
      role: user.role,
      auth_time: Math.floor(new Date(authSession.createdAt).getTime() / 1000),
    },
    jwtSecret,
    {
      expiresIn: expiresInSeconds,
    }
  );

  const refreshToken = crypto.randomBytes(48).toString("hex");

  // บันทึก OAuthToken และเคลียร์ authorizationCode เพื่อป้องกัน Replay Attack
  const [createdToken] = await prisma.$transaction([
    prisma.oAuthToken.create({
      data: {
        clientId: authSession.clientId,
        userId: user.id,
        accessToken,
        refreshToken,
        scope: authSession.scope,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
        lastUsedAt: new Date(),
        expiresAt,
      },
    }),
    prisma.authSession.update({
      where: { id: authSession.id },
      data: {
        authorizationCode: null,
        lastAccessedAt: new Date(),
      },
    }),
  ]);

  await recordAuditAndSessionLog({
    request,
    userId: user.id,
    clientId: authSession.clientId,
    authSessionId: authSession.id,
    action: "OAUTH_TOKEN_ISSUED",
    eventType: "TOKEN_EXCHANGED",
    category: "OAUTH",
    status: "SUCCESS",
    severity: "INFO",
    statusCode: 200,
    responseTimeMs: Date.now() - startTime,
    metadata: {
      tokenId: createdToken.id,
      grantType: "authorization_code",
      scope: authSession.scope,
      expiresAt: expiresAt.toISOString(),
    },
  });

  return NextResponse.json(
    {
      token_type: "Bearer",
      access_token: accessToken,
      expires_in: expiresInSeconds,
      refresh_token: refreshToken,
      id_token: idToken,
      scope: authSession.scope,
    },
    { status: 200, headers: NO_STORE_HEADERS }
  );
}

/**
 * จัดการ Flow สำหรับ grant_type=refresh_token พร้อมทำ Refresh Token Rotation
 */
async function handleRefreshTokenGrant({
  request,
  body,
  basicAuth,
  ctx,
  startTime,
}) {
  const refreshToken = body.refresh_token;
  const clientId = body.client_id || basicAuth?.clientId;
  const clientSecret = body.client_secret || basicAuth?.clientSecret;

  // 1. ตรวจสอบพารามิเตอร์ที่จำเป็น
  if (!refreshToken || !clientId) {
    return NextResponse.json(
      {
        error: "invalid_request",
        error_description: "Missing required parameters: refresh_token or client_id",
      },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  // 2. ตรวจสอบความถูกต้องของ Client กับตาราง OAuthClient
  const client = await prisma.oAuthClient.findUnique({
    where: { clientId },
  });

  if (!client) {
    await recordAuditAndSessionLog({
      request,
      action: "OAUTH_REFRESH_INVALID_CLIENT",
      eventType: "TOKEN_REFRESH_FAILED",
      category: "SECURITY",
      status: "FAILURE",
      severity: "HIGH",
      statusCode: 401,
      responseTimeMs: Date.now() - startTime,
      reason: `Unknown client_id: ${clientId}`,
    });

    return NextResponse.json(
      {
        error: "invalid_client",
        error_description: "Invalid client_id",
      },
      { status: 401, headers: NO_STORE_HEADERS }
    );
  }

  // หากไม่ใช่ Public Client (isPublic === false) ต้อง Verify client_secret ให้ตรงกัน
  if (!client.isPublic) {
    const isSecretValid = await verifyClientSecret(
      clientSecret,
      client.clientSecret
    );

    if (!isSecretValid) {
      await recordAuditAndSessionLog({
        request,
        clientId: client.id,
        action: "OAUTH_REFRESH_INVALID_CLIENT_SECRET",
        eventType: "TOKEN_REFRESH_FAILED",
        category: "SECURITY",
        status: "FAILURE",
        severity: "CRITICAL",
        statusCode: 401,
        responseTimeMs: Date.now() - startTime,
        reason: "Invalid or missing client_secret on refresh_token grant",
      });

      return NextResponse.json(
        {
          error: "invalid_client",
          error_description: "Invalid client credentials",
        },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }
  }

  // 3. ตรวจสอบสถานะ Refresh Token ในตาราง OAuthToken
  const tokenRecord = await prisma.oAuthToken.findUnique({
    where: { refreshToken },
    include: {
      client: true,
      user: true,
    },
  });

  if (
    !tokenRecord ||
    !tokenRecord.user ||
    tokenRecord.isRevoked ||
    tokenRecord.clientId !== client.id
  ) {
    await recordAuditAndSessionLog({
      request,
      userId: tokenRecord?.userId || null,
      clientId: client.id,
      action: "OAUTH_REFRESH_INVALID_GRANT",
      eventType: "TOKEN_REFRESH_FAILED",
      category: "SECURITY",
      status: "FAILURE",
      severity: "HIGH",
      statusCode: 400,
      responseTimeMs: Date.now() - startTime,
      reason: !tokenRecord
        ? "Refresh token not found (possible replay or invalid token)"
        : tokenRecord.isRevoked
          ? "Refresh token is revoked"
          : "Refresh token clientId mismatch",
    });

    return NextResponse.json(
      {
        error: "invalid_grant",
        error_description: "Invalid or revoked refresh token",
      },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  // ตรวจสอบวันหมดอายุของ Refresh Token (กำหนดอายุสูงสุด 30 วันนับจากวันที่สร้าง)
  const refreshMaxAgeMs = 30 * 24 * 60 * 60 * 1000;
  const refreshExpiresAt = new Date(
    new Date(tokenRecord.createdAt).getTime() + refreshMaxAgeMs
  );

  if (new Date() > refreshExpiresAt) {
    await recordAuditAndSessionLog({
      request,
      userId: tokenRecord.userId,
      clientId: client.id,
      action: "OAUTH_REFRESH_TOKEN_EXPIRED",
      eventType: "TOKEN_REFRESH_FAILED",
      category: "OAUTH",
      status: "FAILURE",
      severity: "WARNING",
      statusCode: 400,
      responseTimeMs: Date.now() - startTime,
      reason: "Refresh token exceeded 30-day maximum lifetime",
    });

    return NextResponse.json(
      {
        error: "invalid_grant",
        error_description: "Invalid or revoked refresh token",
      },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  // 4. ออก Access Token ใหม่ และทำ Refresh Token Rotation
  const jwtSecret = process.env.JWT_SECRET;
  const issuer = process.env.NEXT_PUBLIC_APP_URL;
  const expiresInSeconds = (await userPreferences(tokenRecord.userId)).accessTokenTtl;
  const newExpiresAt = new Date(Date.now() + expiresInSeconds * 1000);
  const { user } = tokenRecord;

  const newAccessToken = jwt.sign(
    {
      sub: user.id,
      client_id: client.clientId,
      scope: tokenRecord.scope,
      role: user.role,
      jti: crypto.randomUUID(),
    },
    jwtSecret,
    {
      expiresIn: expiresInSeconds,
      issuer,
      audience: client.clientId,
    }
  );

  const newRefreshToken = crypto.randomBytes(48).toString("hex");

  // อัปเดตเรคคอร์ดเดิมใน OAuthToken (เผา Refresh Token เก่าทิ้งด้วยค่าใหม่ทันที)
  await prisma.oAuthToken.update({
    where: { id: tokenRecord.id },
    data: {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      expiresAt: newExpiresAt,
      lastUsedAt: new Date(),
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    },
  });

  await recordAuditAndSessionLog({
    request,
    userId: user.id,
    clientId: client.id,
    action: "OAUTH_TOKEN_REFRESHED",
    eventType: "TOKEN_REFRESHED",
    category: "OAUTH",
    status: "SUCCESS",
    severity: "INFO",
    statusCode: 200,
    responseTimeMs: Date.now() - startTime,
    metadata: {
      tokenId: tokenRecord.id,
      grantType: "refresh_token",
      scope: tokenRecord.scope,
      newExpiresAt: newExpiresAt.toISOString(),
    },
  });

  return NextResponse.json(
    {
      token_type: "Bearer",
      access_token: newAccessToken,
      expires_in: expiresInSeconds,
      refresh_token: newRefreshToken,
      scope: tokenRecord.scope,
    },
    { status: 200, headers: NO_STORE_HEADERS }
  );
}

export async function POST(request) {
  const startTime = Date.now();
  const ctx = getRequestContext(request);

  try {
    const body = await parseTokenRequestBody(request);
    const basicAuth = extractBasicAuthCredentials(request);
    const grantType = body.grant_type;

    if (grantType === "authorization_code") {
      return await handleAuthorizationCodeGrant({
        request,
        body,
        basicAuth,
        ctx,
        startTime,
      });
    }

    if (grantType === "refresh_token") {
      return await handleRefreshTokenGrant({
        request,
        body,
        basicAuth,
        ctx,
        startTime,
      });
    }

    await recordAuditAndSessionLog({
      request,
      action: "OAUTH_TOKEN_UNSUPPORTED_GRANT_TYPE",
      eventType: "TOKEN_EXCHANGE_FAILED",
      category: "OAUTH",
      status: "FAILURE",
      severity: "WARNING",
      statusCode: 400,
      responseTimeMs: Date.now() - startTime,
      reason: `Unsupported grant_type: ${grantType}`,
      metadata: { grantType },
    });

    return NextResponse.json(
      {
        error: "unsupported_grant_type",
        error_description: "Unsupported grant_type",
      },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    console.error("[OAuth Token Error]:", error);

    await recordAuditAndSessionLog({
      request,
      action: "OAUTH_TOKEN_ERROR",
      eventType: "TOKEN_EXCHANGE_ERROR",
      category: "OAUTH",
      status: "FAILURE",
      severity: "CRITICAL",
      statusCode: 500,
      responseTimeMs: Date.now() - startTime,
      reason: error.message || "Internal server error",
    });

    return NextResponse.json(
      {
        error: "server_error",
        error_description: "An unexpected error occurred",
      },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
