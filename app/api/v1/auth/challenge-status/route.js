import jwt from "jsonwebtoken";
import { verifyDeviceProof, challengePayload } from "@/lib/device-proof";
import { NextResponse } from "next/server";
import crypto from "crypto";
import prisma from "@/lib/prisma";
import { getRequestContext, recordAuditAndSessionLog } from "@/lib/audit";

/**
 * GET /api/v1/auth/challenge-status?id=...
 * ใช้สำหรับหน้าเว็บ /challenge/[id] ทำ Polling ทุก 2 วินาที
 */
export async function GET(request) {
  const startTime = Date.now();
  const ctx = getRequestContext(request);
  const { searchParams } = new URL(request.url);
  const challengeId = searchParams.get("id");

  if (!challengeId) {
    return NextResponse.json(
      { error: "กรุณาระบุพารามิเตอร์ id ของ Challenge" },
      { status: 400 }
    );
  }

  try {
    const proof = jwt.verify(request.cookies.get("sso_challenge")?.value || "", process.env.JWT_SECRET, {algorithms: ["HS256"]});
    if (proof.purpose !== "challenge_browser" || proof.sub !== challengeId) throw new Error("Invalid browser");
  } catch {
    return NextResponse.json({error: "Unauthorized challenge browser"}, {status: 401});
  }
  try {
    const challenge = await prisma.authChallenge.findUnique({
      where: { id: challengeId },
      include: {
        device: true,
        authSession: {
          include: {
            client: true,
            user: true,
          },
        },
      },
    });

    if (!challenge) {
      return NextResponse.json(
        { error: "ไม่พบรายการ 2FA Challenge นี้ในระบบ" },
        { status: 404 }
      );
    }

    const authSession = challenge.authSession;

    // 1. ตรวจสอบว่าหมดอายุหรือยัง (กรณีสถานะยังเป็น PENDING)
    if (
      challenge.status === "PENDING" &&
      new Date() > new Date(challenge.expiresAt)
    ) {
      await prisma.$transaction([
        prisma.authChallenge.update({
          where: { id: challenge.id },
          data: { status: "EXPIRED" },
        }),
        prisma.authSession.update({
          where: { id: authSession.id },
          data: { status: "EXPIRED", lastAccessedAt: new Date() },
        }),
      ]);

      await recordAuditAndSessionLog({
        request,
        userId: authSession.userId,
        clientId: authSession.clientId,
        authSessionId: authSession.id,
        deviceId: challenge.deviceId,
        action: "2FA_CHALLENGE_EXPIRED",
        eventType: "2FA_EXPIRED",
        category: "2FA",
        status: "FAILURE",
        severity: "WARNING",
        statusCode: 200,
        responseTimeMs: Date.now() - startTime,
        reason: "2FA challenge timed out",
      });

      return NextResponse.json({
        status: "EXPIRED",
        challengeId: challenge.id,
        challengeCode: challenge.challengeCode,
        deviceName: challenge.device?.deviceName || "Unknown Device",
        expiresAt: challenge.expiresAt,
      });
    }

    // 2. กรณีสถานะเปลี่ยนเป็น APPROVED -> ส่งต่อไปหน้า Consent (กรณี OAuth Flow) หรือหน้าปลายทาง
    if (challenge.status === "APPROVED") {
      const isOAuthFlow =
        authSession.state !== "portal_direct" &&
        authSession.redirectUri &&
        authSession.redirectUri.startsWith("http");

      let redirectUrl = "/settings/security";

      if (isOAuthFlow) {
        // ส่งไปหน้า Consent Screen เพื่อให้ผู้ใช้กดยืนยันสิทธิ์ก่อนออก Authorization Code
        if (authSession.status !== "AWAITING_CONSENT") {
          await prisma.authSession.update({
            where: { id: authSession.id },
            data: {
              status: "AWAITING_CONSENT",
              lastAccessedAt: new Date(),
            },
          });
        }
        redirectUrl = `/consent?session_id=${encodeURIComponent(
          authSession.id
        )}`;
      } else if (authSession.redirectUri) {
        redirectUrl = authSession.redirectUri;
      }

      const sessionToken = crypto.randomBytes(32).toString("hex");
      await prisma.userSession.create({
        data: {
          userId: authSession.userId,
          sessionToken,
          deviceId: challenge.deviceId,
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
          deviceInfo: challenge.device?.deviceName || ctx.userAgent,
          isActive: true,
          mfaVerified: true,
          mfaVerifiedAt: new Date(),
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });

      const response = NextResponse.json({
        status: "APPROVED",
        challengeId: challenge.id,
        challengeCode: challenge.challengeCode,
        deviceName: challenge.device?.deviceName || "Verified Device",
        clientName: authSession.client?.clientName || "SSO Portal",
        redirectUrl,
      });

      response.cookies.set("sso_session", sessionToken, {
        httpOnly: true,
        path: "/",
        maxAge: 7 * 24 * 60 * 60,
        sameSite: "lax",
      });

      return response;
    }

    // 3. กรณีสถานะ PENDING หรือ REJECTED
    return NextResponse.json({
      status: challenge.status,
      challengeId: challenge.id,
      challengeCode: challenge.challengeCode,
      deviceName: challenge.device?.deviceName || "Registered Device",
      clientName: authSession.client?.clientName || "SSO Portal",
      expiresAt: challenge.expiresAt,
      createdAt: challenge.createdAt,
    });
  } catch (error) {
    console.error("[Challenge Status GET Error]:", error);
    return NextResponse.json(
      { error: "เกิดข้อผิดพลาดในการตรวจสอบสถานะ 2FA Challenge" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/v1/auth/challenge-status
 * สำหรับแอปมือถือ (หรือ Simulator บนหน้าเว็บ) ยิงเข้ามาเพื่ออนุมัติ (APPROVED) หรือปฏิเสธ (REJECTED)
 */
export async function POST(request) {
  const startTime = Date.now();

  try {
    const body = await request.json();
    const { challengeId, action, selectedCode, signature, deviceId } = body;

    if (!challengeId) {
      return NextResponse.json(
        { error: "กรุณาระบุ challengeId" },
        { status: 400 }
      );
    }

    const challenge = await prisma.authChallenge.findUnique({
      where: { id: challengeId },
      include: {
        device: true,
        authSession: true,
      },
    });

    if (!challenge) {
      return NextResponse.json(
        { error: "ไม่พบรายการ Challenge" },
        { status: 404 }
      );
    }

    if (!["APPROVE", "REJECT"].includes(action) || (action === "APPROVE" && !/^\d{2}$/.test(String(selectedCode ?? "")))) {
      return NextResponse.json({error: "Invalid action or selectedCode"}, {status: 400});
    }
    if (deviceId !== challenge.deviceId || !challenge.device.isVerified || !verifyDeviceProof(challenge.device.publicKey,
      challengePayload(challenge.id, challenge.nonce, deviceId, action, selectedCode), signature)) {
      return NextResponse.json({error: "Invalid device signature"}, {status: 401});
    }
    if (challenge.status !== "PENDING") {
      return NextResponse.json(
        { error: `Challenge นี้ถูกดำเนินการไปแล้ว (${challenge.status})` },
        { status: 400 }
      );
    }

    if (new Date() > new Date(challenge.expiresAt)) {
      await prisma.authChallenge.update({
        where: { id: challenge.id },
        data: { status: "EXPIRED" },
      });
      return NextResponse.json(
        { error: "Challenge หมดอายุแล้ว" },
        { status: 400 }
      );
    }

    return await prisma.$transaction(async (tx) => {
      const claimed = await tx.authChallenge.updateMany({where: {id: challenge.id, status: "PENDING", expiresAt: {gt: new Date()}}, data: {respondedAt: new Date(), status: "PROCESSING"}});
      if (claimed.count !== 1) return NextResponse.json({error: "Challenge already handled or expired"}, {status: 409});
    // กรณีผู้ใช้กดปฏิเสธ หรือเลือกตัวเลขไม่ตรงกัน
    if (
      action === "REJECT" ||
      (selectedCode && String(selectedCode) !== String(challenge.challengeCode))
    ) {
      await Promise.all([
        tx.authChallenge.update({
          where: { id: challenge.id },
          data: {
            status: "REJECTED",
            respondedAt: new Date(),
          },
        }),
        tx.authSession.update({
          where: { id: challenge.authSessionId },
          data: {
            status: "REJECTED",
            lastAccessedAt: new Date(),
          },
        }),
      ]);

      await recordAuditAndSessionLog({
        request,
        userId: challenge.authSession.userId,
        clientId: challenge.authSession.clientId,
        authSessionId: challenge.authSessionId,
        deviceId: challenge.deviceId,
        action: "2FA_CHALLENGE_REJECTED",
        eventType: "2FA_REJECTED",
        category: "2FA",
        status: "FAILURE",
        severity: "HIGH",
        statusCode: 200,
        responseTimeMs: Date.now() - startTime,
        reason:
          selectedCode && String(selectedCode) !== String(challenge.challengeCode)
            ? "Matching code mismatch"
            : "User rejected 2FA push prompt",
        metadata: { selectedCode, expectedCode: challenge.challengeCode },
      });

      return NextResponse.json({
        status: "REJECTED",
        message: "ปฏิเสธคำขอเข้าสู่ระบบเรียบร้อยแล้ว",
      });
    }

    // กรณีอนุมัติ (APPROVE) -> อัปเดต AuthChallenge เป็น APPROVED และเตรียม AuthSession สำหรับหน้า Consent
    const isOAuthFlow =
      challenge.authSession.state !== "portal_direct" &&
      challenge.authSession.redirectUri &&
      challenge.authSession.redirectUri.startsWith("http");

    await Promise.all([
      tx.authChallenge.update({
        where: { id: challenge.id },
        data: {
          status: "APPROVED",
          respondedAt: new Date(),
        },
      }),
      tx.authSession.update({
        where: { id: challenge.authSessionId },
        data: {
          status: isOAuthFlow ? "AWAITING_CONSENT" : "APPROVED",
          lastAccessedAt: new Date(),
        },
      }),
      tx.userDevice.update({
        where: { id: challenge.deviceId },
        data: {
          lastUsedAt: new Date(),
        },
      }),
    ]);

    await recordAuditAndSessionLog({
      request,
      userId: challenge.authSession.userId,
      clientId: challenge.authSession.clientId,
      authSessionId: challenge.authSessionId,
      deviceId: challenge.deviceId,
      action: "2FA_CHALLENGE_APPROVED",
      eventType: "2FA_VERIFIED",
      category: "2FA",
      status: "SUCCESS",
      severity: "INFO",
      statusCode: 200,
      responseTimeMs: Date.now() - startTime,
      metadata: {
        challengeId: challenge.id,
        deviceName: challenge.device.deviceName,
        nextStep: isOAuthFlow ? "CONSENT_SCREEN" : "PORTAL_REDIRECT",
        hasSignature: Boolean(signature),
      },
    });

    return NextResponse.json({
      status: "APPROVED",
      message: "อนุมัติการยืนยันตัวตน 2FA สำเร็จ",
    });
    });
  } catch (error) {
    console.error("[Challenge Status POST Error]:", error);
    return NextResponse.json(
      { error: "เกิดข้อผิดพลาดในการอัปเดตสถานะ 2FA Challenge" },
      { status: 500 }
    );
  }
}
