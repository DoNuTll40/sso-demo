import { userPreferences } from "@/lib/user-preferences";
import jwt from "jsonwebtoken";
import { sendChallengePush } from "@/lib/push";
import { NextResponse } from "next/server";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";
import { getRequestContext, recordAuditAndSessionLog } from "@/lib/audit";

export async function POST(request) {
  const startTime = Date.now();
  const ctx = getRequestContext(request);

  try {
    const body = await request.json();
    const { username, password, sessionId, session_id } = body;
    const activeSessionId = sessionId || session_id || null;

    if (!username || !password) {
      return NextResponse.json(
        { error: "กรุณาระบุชื่อผู้ใช้และรหัสผ่านให้ครบถ้วน" },
        { status: 400 }
      );
    }

    // 1. ค้นหาผู้ใช้จาก username หรือ email
    const user = await prisma.user.findFirst({
      where: {
        OR: [{ username: username.trim() }, { email: username.trim() }],
      },
    });

    if (!user) {
      await recordAuditAndSessionLog({
        request,
        authSessionId: activeSessionId,
        action: "AUTH_LOGIN_FAILED",
        eventType: "LOGIN_ATTEMPT",
        category: "AUTH",
        status: "FAILURE",
        severity: "WARNING",
        statusCode: 401,
        responseTimeMs: Date.now() - startTime,
        reason: "User not found",
        metadata: { attemptedUsername: username },
      });

      return NextResponse.json(
        { error: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" },
        { status: 401 }
      );
    }

    // 2. ตรวจสอบรหัสผ่านด้วย bcryptjs
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

    if (!isPasswordValid) {
      await recordAuditAndSessionLog({
        request,
        userId: user.id,
        authSessionId: activeSessionId,
        action: "AUTH_LOGIN_FAILED",
        eventType: "LOGIN_ATTEMPT",
        category: "AUTH",
        status: "FAILURE",
        severity: "WARNING",
        statusCode: 401,
        responseTimeMs: Date.now() - startTime,
        reason: "Invalid password",
        metadata: { username: user.username },
      });

      return NextResponse.json(
        { error: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" },
        { status: 401 }
      );
    }

    // 3. ตรวจสอบหรือเตรียม AuthSession
    let authSession = null;
    let isExternalOAuthFlow = false;

    if (activeSessionId) {
      authSession = await prisma.authSession.findUnique({
        where: { id: activeSessionId },
        include: { client: true },
      });

      if (!authSession) {
        return NextResponse.json(
          { error: "ไม่พบข้อมูล OAuth Session หรือ Session หมดอายุ" },
          { status: 400 }
        );
      }

      if (new Date() > new Date(authSession.expiresAt)) {
        await prisma.authSession.update({
          where: { id: authSession.id },
          data: { status: "EXPIRED" },
        });
        return NextResponse.json(
          { error: "OAuth Session หมดอายุ กรุณาเริ่มเข้าสู่ระบบใหม่อีกครั้ง" },
          { status: 400 }
        );
      }

      if (!["PENDING", "AWAITING_CONSENT"].includes(authSession.status)) {
        return NextResponse.json({error: "คำขอนี้ถูกใช้แล้ว กรุณาเริ่มเข้าสู่ระบบใหม่"}, {status: 400});
      }
      isExternalOAuthFlow = true;
    } else {
      // กรณีล็อกอินเข้าหน้า Portal โดยตรง (ไม่มี session_id) ให้ผูกกับ Default Client เพื่อรองรับ 2FA Flow
      let defaultClient = await prisma.oAuthClient.findFirst({
        where: { clientId: "test-client-web" },
      });

      if (!defaultClient) {
        defaultClient = await prisma.oAuthClient.create({
          data: {
            clientId: "test-client-web",
            clientName: "Demo Web Portal",
            redirectUris: [
              "http://localhost:3000/api/auth/callback/custom-sso",
              "https://oauth.pstmn.io/v1/callback",
            ],
            allowedScopes: ["openid", "profile", "email"],
            isPublic: false,
          },
        });
      }

      authSession = await prisma.authSession.create({
        data: {
          clientId: defaultClient.id,
          userId: user.id,
          state: "portal_direct",
          scope: "openid profile email",
          redirectUri: "/settings/security",
          status: "PENDING",
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
          expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        },
        include: { client: true },
      });
    }

    // 4. ตรวจสอบว่า User มีอุปกรณ์ใน UserDevice ที่ isVerified = true หรือไม่
    const verifiedDevices = await prisma.userDevice.findMany({
      where: {
        userId: user.id,
        isVerified: true,
      },
      orderBy: {
        lastUsedAt: "desc",
      },
    });

    // กรณีที่ 1: ยังไม่มีอุปกรณ์ 2FA
    if (verifiedDevices.length === 0) {
      const sessionToken = crypto.randomBytes(32).toString("hex");

      // หากมาจาก OAuth Authorize Flow ให้ส่งไปหน้า Consent (/consent?session_id=...) ก่อนออก Authorization Code
      if (isExternalOAuthFlow) {
        const [, userSession] = await prisma.$transaction([
          prisma.authSession.update({
            where: { id: authSession.id },
            data: {
              userId: user.id,
              status: "AWAITING_CONSENT",
              lastAccessedAt: new Date(),
            },
          }),
          prisma.userSession.create({
            data: {
              userId: user.id,
              sessionToken,
              ipAddress: ctx.ipAddress,
              userAgent: ctx.userAgent,
              deviceInfo: ctx.userAgent,
              isActive: true,
              mfaVerified: false,
              expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            },
          }),
        ]);

        const redirectUrl = `/consent?session_id=${encodeURIComponent(
          authSession.id
        )}`;

        await recordAuditAndSessionLog({
          request,
          userId: user.id,
          clientId: authSession.clientId,
          authSessionId: authSession.id,
          userSessionId: userSession.id,
          action: "AUTH_LOGIN_SUCCESS_AWAITING_CONSENT",
          eventType: "LOGIN_PASSED_AWAITING_CONSENT",
          category: "AUTH",
          status: "SUCCESS",
          severity: "INFO",
          statusCode: 200,
          responseTimeMs: Date.now() - startTime,
          metadata: {
            username: user.username,
            redirectUrl,
          },
        });

        const response = NextResponse.json(
          {
            status: "CONSENT_REQUIRED",
            message: "ตรวจสอบรหัสผ่านสำเร็จ กรุณายืนยันการให้สิทธิ์แอปพลิเคชัน",
            redirectUrl,
            sessionId: authSession.id,
            user: {
              id: user.id,
              username: user.username,
              email: user.email,
              fullName: user.fullName,
              role: user.role,
            },
          },
          { status: 200 }
        );

        response.cookies.set("sso_session", sessionToken, {
          httpOnly: true,
          path: "/",
          maxAge: 7 * 24 * 60 * 60,
          sameSite: "lax",
        });

        return response;
      }

      // กรณี Direct Login เข้าหน้า SSO Portal โดยตรง
      const authorizationCode = crypto.randomBytes(32).toString("hex");
      const [, userSession] = await prisma.$transaction([
        prisma.authSession.update({
          where: { id: authSession.id },
          data: {
            userId: user.id,
            status: "APPROVED",
            authorizationCode,
            lastAccessedAt: new Date(),
          },
        }),
        prisma.userSession.create({
          data: {
            userId: user.id,
            sessionToken,
            ipAddress: ctx.ipAddress,
            userAgent: ctx.userAgent,
            deviceInfo: ctx.userAgent,
            isActive: true,
            mfaVerified: false,
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          },
        }),
      ]);

      const redirectUrl = "/settings/security";

      await recordAuditAndSessionLog({
        request,
        userId: user.id,
        clientId: authSession.clientId,
        authSessionId: authSession.id,
        userSessionId: userSession.id,
        action: "AUTH_LOGIN_SUCCESS_NO_2FA",
        eventType: "LOGIN_APPROVED_NO_2FA",
        category: "AUTH",
        status: "SUCCESS",
        severity: "INFO",
        statusCode: 200,
        responseTimeMs: Date.now() - startTime,
        metadata: {
          username: user.username,
          isExternalOAuthFlow,
          redirectUrl,
        },
      });

      const response = NextResponse.json(
        {
          status: "APPROVED",
          message: "เข้าสู่ระบบสำเร็จ",
          redirectUrl,
          sessionId: authSession.id,
          user: {
            id: user.id,
            username: user.username,
            email: user.email,
            fullName: user.fullName,
            role: user.role,
          },
        },
        { status: 200 }
      );

      response.cookies.set("sso_session", sessionToken, {
        httpOnly: true,
        path: "/",
        maxAge: 7 * 24 * 60 * 60,
        sameSite: "lax",
      });

      return response;
    }

    // กรณีที่ 2: มีอุปกรณ์ 2FA ที่ยืนยันแล้ว -> สุ่มเลข 2 หลัก และสร้าง AuthChallenge
    const targetDevice = verifiedDevices[0];
    const challengeCode = String(Math.floor(10 + Math.random() * 90)); // เลข 2 หลัก 10-99
    const nonce = crypto.randomBytes(16).toString("hex");
    const policy = await userPreferences(user.id);
    const challengeExpiresAt = new Date(Date.now() + policy.challengeTimeout * 1000); // อายุ 2 นาที

    const [, challenge] = await prisma.$transaction([
      prisma.authSession.update({
        where: { id: authSession.id },
        data: {
          userId: user.id,
          status: "AWAITING_2FA",
          lastAccessedAt: new Date(),
        },
      }),
      prisma.authChallenge.create({
        data: {
          authSessionId: authSession.id,
          deviceId: targetDevice.id,
          challengeCode,
          nonce,
          status: "PENDING",
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
          expiresAt: challengeExpiresAt,
        },
      }),
    ]);

    const options = [Number(challengeCode), ((Number(challengeCode) - 10 + 31) % 90) + 10, ((Number(challengeCode) - 10 + 61) % 90) + 10].sort((a,b) => a-b);
    const pushSent = await sendChallengePush(targetDevice.fcmToken, {id: challenge.id, nonce, matchingOptions: options, serviceName: authSession.client.clientName, ipAddress: ctx.ipAddress, browser: ctx.userAgent, requestedAt: challenge.createdAt.toISOString(), expiresAt: challenge.expiresAt.toISOString()});

    await recordAuditAndSessionLog({
      request,
      userId: user.id,
      clientId: authSession.clientId,
      authSessionId: authSession.id,
      deviceId: targetDevice.id,
      action: "2FA_CHALLENGE_CREATED",
      eventType: pushSent ? "2FA_PUSH_SENT" : "2FA_CHALLENGE_CREATED",
      category: "2FA",
      status: "PENDING",
      severity: "INFO",
      statusCode: 200,
      responseTimeMs: Date.now() - startTime,
      metadata: {
        challengeId: challenge.id,
        deviceName: targetDevice.deviceName,
        challengeCode,
        expiresAt: challengeExpiresAt.toISOString(),
      },
    });

    const response = NextResponse.json(
      {
        status: "CHALLENGE_REQUIRED",
        message: "กรุณายืนยันตัวตน 2 ขั้นตอนบนอุปกรณ์ของคุณ",
        challengeId: challenge.id,
        challengeCode,
        deviceName: targetDevice.deviceName,
        redirectUrl: `/challenge/${challenge.id}`,
      },
      { status: 200 }
    );
    response.cookies.set("sso_challenge", jwt.sign({purpose: "challenge_browser"}, process.env.JWT_SECRET, {subject: challenge.id, expiresIn: "3m", algorithm: "HS256"}), {
      httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 180,
    });
    return response;

  } catch (error) {
    console.error("[Auth Login Error]:", error);

    await recordAuditAndSessionLog({
      request,
      action: "AUTH_LOGIN_ERROR",
      eventType: "LOGIN_ERROR",
      category: "AUTH",
      status: "FAILURE",
      severity: "CRITICAL",
      statusCode: 500,
      responseTimeMs: Date.now() - startTime,
      reason: error.message || "Internal server error",
    });

    return NextResponse.json(
      { error: "เกิดข้อผิดพลาดภายในระบบขณะเข้าสู่ระบบ" },
      { status: 500 }
    );
  }
}

