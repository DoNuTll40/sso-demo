import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getRequestContext, recordAuditAndSessionLog } from "@/lib/audit";

export async function GET(request) {
  const startTime = Date.now();
  const { searchParams } = new URL(request.url);

  const clientId = searchParams.get("client_id");
  const redirectUri = searchParams.get("redirect_uri");
  const responseType = searchParams.get("response_type") || "code";
  const scope = searchParams.get("scope") || "openid profile email";
  const state = searchParams.get("state");
  const codeChallenge = searchParams.get("code_challenge");
  const codeChallengeMethod = searchParams.get("code_challenge_method") || "S256";

  const ctx = getRequestContext(request);

  try {
    // 1. ตรวจสอบพารามิเตอร์ที่จำเป็น
    if (!clientId || !redirectUri || !state) {
      await recordAuditAndSessionLog({
        request,
        action: "OAUTH_AUTHORIZE_INVALID_REQUEST",
        eventType: "AUTHORIZE_REJECTED",
        category: "OAUTH",
        status: "FAILURE",
        severity: "WARNING",
        statusCode: 400,
        responseTimeMs: Date.now() - startTime,
        reason: "Missing required OAuth parameters (client_id, redirect_uri, or state)",
        metadata: { clientId, redirectUri, responseType, scope, state },
      });

      return NextResponse.json(
        {
          error: "invalid_request",
          error_description: "กรุณาระบุ client_id, redirect_uri และ state ให้ครบถ้วน",
        },
        { status: 400 }
      );
    }

    if (responseType !== "code") {
      await recordAuditAndSessionLog({
        request,
        action: "OAUTH_AUTHORIZE_UNSUPPORTED_RESPONSE_TYPE",
        eventType: "AUTHORIZE_REJECTED",
        category: "OAUTH",
        status: "FAILURE",
        severity: "WARNING",
        statusCode: 400,
        responseTimeMs: Date.now() - startTime,
        reason: `Unsupported response_type: ${responseType}`,
        metadata: { clientId, redirectUri, responseType },
      });

      return NextResponse.json(
        {
          error: "unsupported_response_type",
          error_description: "รองรับเฉพาะ response_type=code เท่านั้น",
        },
        { status: 400 }
      );
    }

    // 2. ค้นหาและตรวจสอบ OAuthClient จากฐานข้อมูล
    const oauthClient = await prisma.oAuthClient.findUnique({
      where: { clientId },
    });

    if (!oauthClient) {
      await recordAuditAndSessionLog({
        request,
        action: "OAUTH_AUTHORIZE_UNAUTHORIZED_CLIENT",
        eventType: "AUTHORIZE_REJECTED",
        category: "OAUTH",
        status: "FAILURE",
        severity: "HIGH",
        statusCode: 401,
        responseTimeMs: Date.now() - startTime,
        reason: `Unknown client_id: ${clientId}`,
        metadata: { clientId, redirectUri },
      });

      return NextResponse.json(
        {
          error: "unauthorized_client",
          error_description: "ไม่พบข้อมูล OAuth Client ในระบบ",
        },
        { status: 401 }
      );
    }

    // 3. ตรวจสอบ redirect_uri ว่าตรงกับที่ลงทะเบียนไว้หรือไม่
    if (!oauthClient.redirectUris.includes(redirectUri)) {
      await recordAuditAndSessionLog({
        request,
        clientId: oauthClient.id,
        action: "OAUTH_AUTHORIZE_INVALID_REDIRECT_URI",
        eventType: "AUTHORIZE_REJECTED",
        category: "SECURITY",
        status: "FAILURE",
        severity: "HIGH",
        statusCode: 400,
        responseTimeMs: Date.now() - startTime,
        reason: "redirect_uri mismatch",
        metadata: {
          clientId,
          requestedRedirectUri: redirectUri,
          allowedRedirectUris: oauthClient.redirectUris,
        },
      });

      return NextResponse.json(
        {
          error: "invalid_request",
          error_description: "redirect_uri ไม่ตรงกับที่ลงทะเบียนไว้ในระบบ",
        },
        { status: 400 }
      );
    }

    // 4. กรณีเป็น Public Client บังคับให้ส่ง PKCE code_challenge
    if (oauthClient.isPublic && !codeChallenge) {
      await recordAuditAndSessionLog({
        request,
        clientId: oauthClient.id,
        action: "OAUTH_AUTHORIZE_MISSING_PKCE",
        eventType: "AUTHORIZE_REJECTED",
        category: "SECURITY",
        status: "FAILURE",
        severity: "MEDIUM",
        statusCode: 400,
        responseTimeMs: Date.now() - startTime,
        reason: "PKCE code_challenge is required for public clients",
        metadata: { clientId },
      });

      return NextResponse.json(
        {
          error: "invalid_request",
          error_description: "Public Client จำเป็นต้องระบุ code_challenge (PKCE)",
        },
        { status: 400 }
      );
    }

    // 5. สร้างเรคคอร์ดใน AuthSession สถานะ PENDING (อายุ 10 นาที)
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    const authSession = await prisma.authSession.create({
      data: {
        clientId: oauthClient.id,
        state,
        codeChallenge: codeChallenge || null,
        codeChallengeMethod: codeChallenge ? codeChallengeMethod : null,
        scope,
        redirectUri,
        status: "PENDING",
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
        expiresAt,
      },
    });

    // 6. บันทึก Audit Log และ Session Access Log
    await recordAuditAndSessionLog({
      request,
      clientId: oauthClient.id,
      authSessionId: authSession.id,
      action: "OAUTH_AUTHORIZE_SESSION_CREATED",
      eventType: "SESSION_CREATED",
      category: "OAUTH",
      status: "SUCCESS",
      severity: "INFO",
      statusCode: 302,
      responseTimeMs: Date.now() - startTime,
      metadata: {
        oauthClientId: clientId,
        scope,
        redirectUri,
        codeChallengeMethod: codeChallenge ? codeChallengeMethod : null,
        expiresAt: expiresAt.toISOString(),
      },
    });

    // 7. Redirect ไปหน้า /login?session_id=...
    const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
    const loginUrl = new URL("/login", appBaseUrl);
    loginUrl.searchParams.set("session_id", authSession.id);

    return NextResponse.redirect(loginUrl.toString(), { status: 302 });
  } catch (error) {
    console.error("[OAuth Authorize Error]:", error);

    await recordAuditAndSessionLog({
      request,
      action: "OAUTH_AUTHORIZE_ERROR",
      eventType: "AUTHORIZE_ERROR",
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
        error_description: "เกิดข้อผิดพลาดภายในระบบขณะสร้าง OAuth Session",
      },
      { status: 500 }
    );
  }
}

