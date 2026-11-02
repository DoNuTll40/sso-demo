import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import prisma from "@/lib/prisma";
import { recordAuditAndSessionLog } from "@/lib/audit";
import { getGravatarUrl } from "@/lib/gravatar";

export async function GET(request) {
  const startTime = Date.now();

  try {
    // 1. ดึง Access Token จาก Header Authorization: Bearer <token>
    const authHeader = request.headers.get("authorization");

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      await recordAuditAndSessionLog({
        request,
        action: "OAUTH_USERINFO_MISSING_TOKEN",
        eventType: "USERINFO_ACCESSED",
        category: "OAUTH",
        status: "FAILURE",
        severity: "WARNING",
        statusCode: 401,
        responseTimeMs: Date.now() - startTime,
        reason: "Missing or invalid Authorization header",
      });

      return NextResponse.json(
        {
          error: "invalid_token",
          error_description: "Missing or invalid Authorization header",
        },
        { status: 401 }
      );
    }

    const token = authHeader.slice(7).trim();

    if (!token) {
      return NextResponse.json(
        {
          error: "invalid_token",
          error_description: "Missing or invalid Authorization header",
        },
        { status: 401 }
      );
    }

    // 2. ทำการ Verify JWT Token ด้วย process.env.JWT_SECRET
    const jwtSecret = process.env.JWT_SECRET || "default-dev-jwt-secret";

    try {
      jwt.verify(token, jwtSecret);
    } catch (jwtError) {
      await recordAuditAndSessionLog({
        request,
        action: "OAUTH_USERINFO_INVALID_JWT",
        eventType: "USERINFO_ACCESSED",
        category: "SECURITY",
        status: "FAILURE",
        severity: "MEDIUM",
        statusCode: 401,
        responseTimeMs: Date.now() - startTime,
        reason: jwtError.message || "Token expired or invalid signature",
      });

      return NextResponse.json(
        {
          error: "invalid_token",
          error_description: "Token expired or invalid signature",
        },
        { status: 401 }
      );
    }

    // 3. ตรวจสอบสถานะ Token กับฐานข้อมูล Neon Postgres ผ่าน Prisma
    const tokenRecord = await prisma.oAuthToken.findUnique({
      where: { accessToken: token },
      include: { user: true },
    });

    if (
      !tokenRecord ||
      !tokenRecord.user ||
      tokenRecord.isRevoked ||
      new Date() > new Date(tokenRecord.expiresAt)
    ) {
      await recordAuditAndSessionLog({
        request,
        userId: tokenRecord?.userId || null,
        clientId: tokenRecord?.clientId || null,
        action: "OAUTH_USERINFO_TOKEN_REVOKED_OR_EXPIRED",
        eventType: "USERINFO_ACCESSED",
        category: "SECURITY",
        status: "FAILURE",
        severity: "HIGH",
        statusCode: 401,
        responseTimeMs: Date.now() - startTime,
        reason: !tokenRecord
          ? "Token not found in database"
          : tokenRecord.isRevoked
            ? "Token has been revoked"
            : "Token expired in database",
      });

      return NextResponse.json(
        {
          error: "invalid_token",
          error_description: "Token is revoked, expired, or not found",
        },
        { status: 401 }
      );
    }

    const { user } = tokenRecord;

    // 4. ประกอบ Claims ข้อมูลผู้ใช้ตามมาตรฐาน OpenID Connect Core 1.0
    const scopes = (tokenRecord.scope || "")
      .split(/\s+/)
      .map((s) => s.trim())
      .filter(Boolean);

    const claims = {
      sub: user.id,
    };

    if (scopes.includes("profile")) {
      claims.name = user.fullName;
      claims.preferred_username = user.username;
      claims.role = user.role;
      claims.picture = user.avatarUrl || getGravatarUrl(user.email, 128);
      claims.updated_at = Math.floor(new Date(user.updatedAt).getTime() / 1000);
    }

    if (scopes.includes("email")) {
      claims.email = user.email;
      claims.email_verified = true;
    }

    // อัปเดตเวลาใช้งาน Token ล่าสุด และบันทึก Audit Log / Session Access Log
    await Promise.all([
      prisma.oAuthToken.update({
        where: { id: tokenRecord.id },
        data: { lastUsedAt: new Date() },
      }),
      recordAuditAndSessionLog({
        request,
        userId: user.id,
        clientId: tokenRecord.clientId,
        action: "OAUTH_USERINFO_SUCCESS",
        eventType: "USERINFO_ACCESSED",
        category: "OAUTH",
        status: "SUCCESS",
        severity: "INFO",
        statusCode: 200,
        responseTimeMs: Date.now() - startTime,
        metadata: {
          tokenId: tokenRecord.id,
          scopes,
          returnedClaims: Object.keys(claims),
        },
      }),
    ]);

    return NextResponse.json(claims, {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
        Pragma: "no-cache",
      },
    });
  } catch (error) {
    console.error("[OIDC UserInfo Error]:", error);

    return NextResponse.json(
      {
        error: "server_error",
        error_description: "An unexpected error occurred",
      },
      { status: 500 }
    );
  }
}

