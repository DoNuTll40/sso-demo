import { currentUser as authenticatedUser } from "@/lib/session-auth";
import { NextResponse } from "next/server";
import crypto from "crypto";
import prisma from "@/lib/prisma";
import { recordAuditAndSessionLog } from "@/lib/audit";

/**
 * GET /api/v1/oauth/consent?session_id=...
 * ดึงข้อมูลรายละเอียดของ AuthSession, OAuthClient, User และรายการ Scopes ที่ร้องขอสำหรับแสดงผลหน้า Consent
 */
export async function GET(request) {
  const user = await authenticatedUser(request);
  if (!user) return NextResponse.json({error: "Unauthorized"}, {status: 401});
  const startTime = Date.now();
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("session_id") || searchParams.get("sessionId");

  if (!sessionId) {
    return NextResponse.json(
      { error: "invalid_request", error_description: "กรุณาระบุพารามิเตอร์ session_id" },
      { status: 400 }
    );
  }

  try {
    const authSession = await prisma.authSession.findUnique({
      where: { id: sessionId },
      include: {
        client: true,
        user: true,
      },
    });

    if (!authSession) {
      return NextResponse.json(
        { error: "not_found", error_description: "ไม่พบข้อมูล OAuth Session นี้ในระบบ" },
        { status: 404 }
      );
    }

    if (authSession.userId !== user.id) return NextResponse.json({error: "Forbidden"}, {status: 403});

    // ตรวจสอบว่า Session หมดอายุหรือยัง
    if (new Date() > new Date(authSession.expiresAt)) {
      if (authSession.status !== "EXPIRED") {
        await prisma.authSession.update({
          where: { id: authSession.id },
          data: { status: "EXPIRED" },
        });
      }
      return NextResponse.json(
        { error: "expired_session", error_description: "เซสชันการขอสิทธิ์หมดอายุแล้ว กรุณาเข้าสู่ระบบใหม่" },
        { status: 400 }
      );
    }

    // หากยังไม่มี user ผูกใน AuthSession ให้ลองดึงจาก Cookie sso_session
    let currentUser = authSession.user;
    if (!currentUser) {
      const sessionToken = request.cookies.get("sso_session")?.value;
      if (sessionToken) {
        const userSession = await prisma.userSession.findUnique({
          where: { sessionToken },
          include: { user: true },
        });
        if (userSession?.user && userSession.isActive) {
          currentUser = userSession.user;
        }
      }
    }

    const scopes = (authSession.scope || "openid profile email")
      .split(/\s+/)
      .map((s) => s.trim())
      .filter(Boolean);

        // Match this account, client, callback and the complete scope set from a prior approval.
    const previousApprovals = await prisma.auditLog.findMany({
      where: {userId: user.id, clientId: authSession.clientId, action: "OAUTH_CONSENT_APPROVED", status: "SUCCESS"},
      select: {metadata: true},
    });
    const previouslyApproved = previousApprovals.some(({metadata}) => {
      const granted = new Set(String(metadata?.scope || "").split(/\s+/).filter(Boolean));
      return metadata?.redirectUri === authSession.redirectUri && scopes.every(scope => granted.has(scope));
    });
await recordAuditAndSessionLog({
      request,
      userId: currentUser?.id || null,
      clientId: authSession.clientId,
      authSessionId: authSession.id,
      action: "OAUTH_CONSENT_VIEWED",
      eventType: "CONSENT_SCREEN_VIEWED",
      category: "OAUTH",
      status: "SUCCESS",
      severity: "INFO",
      statusCode: 200,
      responseTimeMs: Date.now() - startTime,
      metadata: {
        clientName: authSession.client.clientName,
        scopes,
      },
    });

    return NextResponse.json({
      previouslyApproved,
      sessionId: authSession.id,
      status: authSession.status,
      state: authSession.state,
      redirectUri: authSession.redirectUri,
      expiresAt: authSession.expiresAt,
      scopes,
      client: {
        id: authSession.client.id,
        clientId: authSession.client.clientId,
        clientName: authSession.client.clientName,
        isPublic: authSession.client.isPublic,
      },
      user: currentUser
        ? {
            id: currentUser.id,
            username: currentUser.username,
            fullName: currentUser.fullName,
            email: currentUser.email,
            role: currentUser.role,
            avatarUrl: currentUser.avatarUrl,
          }
        : null,
    });
  } catch (error) {
    console.error("[OAuth Consent GET Error]:", error);
    return NextResponse.json(
      { error: "server_error", error_description: "เกิดข้อผิดพลาดในการดึงข้อมูล Consent" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/v1/oauth/consent
 * รับการตัดสินใจของผู้ใช้ { sessionId: string, action: "allow" | "deny" }
 */
export async function POST(request) {
  const user = await authenticatedUser(request);
  if (!user) return NextResponse.json({error: "Unauthorized"}, {status: 401});
  const startTime = Date.now();

  try {
    const body = await request.json();
    const { sessionId, action } = body;

    if (!sessionId || !["allow", "deny"].includes(action)) {
      return NextResponse.json(
        {
          error: "invalid_request",
          error_description: "กรุณาระบุ sessionId และ action ('allow' หรือ 'deny') ให้ถูกต้อง",
        },
        { status: 400 }
      );
    }

    const authSession = await prisma.authSession.findUnique({
      where: { id: sessionId },
      include: {
        client: true,
        user: true,
      },
    });

    if (!authSession) {
      return NextResponse.json(
        {
          error: "invalid_session",
          error_description: "ไม่พบข้อมูล AuthSession",
        },
        { status: 404 }
      );
    }

    if (authSession.userId !== user.id) return NextResponse.json({error: "Forbidden"}, {status: 403});

    // 1. ตรวจสอบวันหมดอายุของ AuthSession
    if (new Date() >= new Date(authSession.expiresAt)) {
      await prisma.authSession.update({
        where: { id: authSession.id },
        data: { status: "EXPIRED", lastAccessedAt: new Date() },
      });

      await recordAuditAndSessionLog({
        request,
        userId: authSession.userId,
        clientId: authSession.clientId,
        authSessionId: authSession.id,
        action: "OAUTH_CONSENT_EXPIRED",
        eventType: "CONSENT_EXPIRED",
        category: "OAUTH",
        status: "FAILURE",
        severity: "WARNING",
        statusCode: 400,
        responseTimeMs: Date.now() - startTime,
        reason: "AuthSession expired before consent submission",
      });

      return NextResponse.json(
        {
          error: "expired_session",
          error_description: "เซสชันหมดอายุแล้ว กรุณาเข้าสู่ระบบใหม่อีกครั้ง",
        },
        { status: 400 }
      );
    }

    // 2. ตรวจสอบสถานะของ AuthSession ต้องอยู่ในสถานะรอรับการยินยอม
    const allowedStatuses = ["AWAITING_CONSENT"];
    if (!allowedStatuses.includes(authSession.status)) {
      return NextResponse.json(
        {
          error: "invalid_state",
          error_description: `เซสชันนี้ไม่อยู่ในสถานะที่สามารถทำรายการได้ (สถานะปัจจุบัน: ${authSession.status})`,
        },
        { status: 400 }
      );
    }

    // 3. กรณีผู้ใช้กด "ยกเลิก (Deny / Cancel)"
    if (action === "deny") {
      await prisma.authSession.update({
        where: { id: authSession.id },
        data: {
          status: "REJECTED",
          authorizationCode: null,
          lastAccessedAt: new Date(),
        },
      });

      const redirectUrl = `${authSession.redirectUri}${
        authSession.redirectUri.includes("?") ? "&" : "?"
      }error=access_denied&error_description=User%20denied%20consent&state=${encodeURIComponent(
        authSession.state
      )}`;

      await recordAuditAndSessionLog({
        request,
        userId: authSession.userId,
        clientId: authSession.clientId,
        authSessionId: authSession.id,
        action: "OAUTH_CONSENT_DENIED",
        eventType: "CONSENT_DENIED",
        category: "OAUTH",
        status: "FAILURE",
        severity: "WARNING",
        statusCode: 200,
        responseTimeMs: Date.now() - startTime,
        reason: "User denied scope consent",
        metadata: {
          clientId: authSession.client.clientId,
          redirectUrl,
        },
      });

      return NextResponse.json({
        status: "REJECTED",
        message: "ปฏิเสธการให้สิทธิ์เข้าถึงข้อมูลเรียบร้อยแล้ว",
        redirectUrl,
      });
    }

    // 4. กรณีผู้ใช้กด "ยินยอม (Authorize / Allow)"
    // สุ่มสร้าง authorizationCode แบบ Hex 64 ตัวอักษร (32 bytes)
    const authorizationCode = crypto.randomBytes(32).toString("hex");

    const claimed = await prisma.authSession.updateMany({
      where: { id: authSession.id, status: "AWAITING_CONSENT", expiresAt: {gt: new Date()} },
      data: { status: "APPROVED", authorizationCode, lastAccessedAt: new Date() },
    });
    if (claimed.count !== 1) return NextResponse.json({error:"invalid_state",error_description:"คำขอถูกใช้แล้วหรือหมดอายุ"},{status:409});

    const redirectUrl = `${authSession.redirectUri}${
      authSession.redirectUri.includes("?") ? "&" : "?"
    }code=${encodeURIComponent(authorizationCode)}&state=${encodeURIComponent(
      authSession.state
    )}`;

    await recordAuditAndSessionLog({
      request,
      userId: authSession.userId,
      clientId: authSession.clientId,
      authSessionId: authSession.id,
      action: "OAUTH_CONSENT_APPROVED",
      eventType: "CODE_ISSUED",
      category: "OAUTH",
      status: "SUCCESS",
      severity: "INFO",
      statusCode: 200,
      responseTimeMs: Date.now() - startTime,
      metadata: {
        clientId: authSession.client.clientId,
        ssoSessionId: (await prisma.userSession.findUnique({where:{sessionToken:request.cookies.get("sso_session")?.value || ""},select:{id:true}}))?.id,
        scope: authSession.scope,
        redirectUri: authSession.redirectUri,
      },
    });

    return NextResponse.json({
      status: "APPROVED",
      message: "อนุมัติสิทธิ์สำเร็จ กำลังส่งต่อไปยังแอปพลิเคชัน",
      authorizationCode,
      redirectUrl,
    });
  } catch (error) {
    console.error("[OAuth Consent POST Error]:", error);
    return NextResponse.json(
      {
        error: "server_error",
        error_description: "เกิดข้อผิดพลาดภายในระบบขณะบันทึกการยินยอมสิทธิ์",
      },
      { status: 500 }
    );
  }
}




