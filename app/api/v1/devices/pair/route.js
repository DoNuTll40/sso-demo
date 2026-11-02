import os from "os";
import { currentUser } from "@/lib/session-auth";
import { NextResponse } from "next/server";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import prisma from "@/lib/prisma";
import { recordAuditAndSessionLog } from "@/lib/audit";
import { getGravatarUrl } from "@/lib/gravatar";

/**
 * Device pairing requires an authenticated browser or a valid one-use QR token.
 */
/**
 * GET /api/v1/devices/pair
 * ดึงรายการอุปกรณ์ 2FA ที่ผูกไว้ พร้อมสร้าง QR Code Payload สำหรับผูกอุปกรณ์ใหม่
 */
export async function GET(request) {
  try {
    const user = await currentUser(request);

    if (!user) {
      return NextResponse.json(
        { error: "ไม่พบข้อมูลผู้ใช้งานในระบบ กรุณารัน Seed หรือเข้าสู่ระบบก่อน" },
        { status: 401 }
      );
    }

    const devices = await prisma.userDevice.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    });

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) throw new Error("JWT_SECRET is required");
    const pairingToken = jwt.sign(
      {
        sub: user.id,
        username: user.username,
        purpose: "device_pairing",
        jti: crypto.randomUUID(),
      },
      jwtSecret,
      { expiresIn: "10m" }
    );

    const originUrl = new URL(process.env.MOBILE_API_URL || process.env.NEXT_PUBLIC_APP_URL || request.url);
    if (process.env.NODE_ENV !== "production" && ["localhost", "127.0.0.1", "::1", "[::1]"].includes(originUrl.hostname)) {
      const addresses = Object.values(os.networkInterfaces()).flat();
      const address = addresses.find(x => x && x.family === "IPv4" && !x.internal && /^192\.168\./.test(x.address))
        || addresses.find(x => x && x.family === "IPv4" && !x.internal);
      if (address) originUrl.hostname = address.address;
    }
    const endpoint = originUrl.origin;

    const qrPayload = {
      endpoint,
      pairingToken,
      userId: user.id,
    };

    return NextResponse.json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        avatarUrl: user.avatarUrl || getGravatarUrl(user.email, 128),
      },
      devices: devices.map(({ fcmToken, ...device }) => device),
      qrPayload,
    });
  } catch (error) {
    console.error("[Devices Pair GET Error]:", error);
    return NextResponse.json(
      { error: "ไม่สามารถดึงข้อมูลอุปกรณ์ได้" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/v1/devices/pair
 * รับ Request จากแอปมือถือ React Native ที่สแกน QR Code เพื่อบันทึก fcmToken, publicKey และ deviceName
 */
export async function POST(request) {
  const startTime = Date.now();

  try {
    const body = await request.json();
    const { pairingToken, userId, deviceName, pushToken, fcmToken, publicKey } = body;

    if (typeof deviceName !== "string" || !deviceName.trim() || typeof publicKey !== "string" || !publicKey) {
      return NextResponse.json(
        { error: "กรุณาระบุ deviceName และ publicKey ให้ครบถ้วน" },
        { status: 400 }
      );
    }

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) throw new Error("JWT_SECRET is required");
    let decoded;
    try {
      decoded = jwt.verify(pairingToken, jwtSecret, {algorithms: ["HS256"]});
      if (decoded.purpose !== "device_pairing" || !decoded.jti || !decoded.sub || (userId && userId !== decoded.sub)) throw new Error("Invalid pairing token");
    } catch {
      return NextResponse.json({error: "Pairing Token ไม่ถูกต้องหรือหมดอายุ"}, {status: 401});
    }
    if (!/^ed25519:[0-9a-f]{64}$/.test(publicKey)) return NextResponse.json({error: "โปรดอัปเดตแอปและผูกอุปกรณ์ใหม่"}, {status: 400});
    const resolvedUserId = decoded.sub;
    const user = await prisma.user.findUnique({
      where: { id: resolvedUserId },
    });

    if (!user) {
      return NextResponse.json(
        { error: "ไม่พบบัญชีผู้ใช้งานในระบบ" },
        { status: 404 }
      );
    }

    const device = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${decoded.jti}))::text`;
      const used = await tx.auditLog.findFirst({where: {action: "PAIR_TOKEN_CONSUMED", metadata: {path: ["jti"], equals: decoded.jti}}});
      if (used) throw new Error("Pairing token already used");
      const device = await tx.userDevice.create({data: {
        userId: user.id, deviceName: deviceName.trim(),
        fcmToken: /^(ExponentPushToken|ExpoPushToken)\[[^\]]+\]$/.test(pushToken || fcmToken || "") ? (pushToken || fcmToken) : "",
        publicKey: publicKey.trim(), isVerified: true, lastUsedAt: new Date(),
      }});
      await tx.auditLog.create({data: {userId: user.id, action: "PAIR_TOKEN_CONSUMED", metadata: {jti: decoded.jti}}});
      return device;
    });

    await recordAuditAndSessionLog({
      request,
      userId: user.id,
      deviceId: device.id,
      action: "DEVICE_PAIRED",
      eventType: "DEVICE_PAIRED",
      category: "DEVICE",
      status: "SUCCESS",
      severity: "INFO",
      statusCode: 201,
      responseTimeMs: Date.now() - startTime,
      metadata: {
        deviceName: device.deviceName,
        isVerified: device.isVerified,
      },
    });

    return NextResponse.json(
      {
        status: "PAIRED",
        message: "ผูกอุปกรณ์ 2FA สำเร็จเรียบร้อยแล้ว",
        device: { id: device.id, deviceName: device.deviceName, userId: device.userId, isVerified: device.isVerified },
      },
      { status: 201 }
    );
  } catch (error) {
    if (error.message === "Pairing token already used") return NextResponse.json({error: "QR นี้ถูกใช้แล้ว กรุณาสร้าง QR ใหม่"}, {status: 409});
    console.error("[Devices Pair POST Error]:", error);

    await recordAuditAndSessionLog({
      request,
      action: "DEVICE_PAIR_FAILED",
      eventType: "DEVICE_PAIR_FAILED",
      category: "DEVICE",
      status: "FAILURE",
      severity: "HIGH",
      statusCode: 500,
      responseTimeMs: Date.now() - startTime,
      reason: error.message || "Internal server error",
    });

    return NextResponse.json(
      { error: "เกิดข้อผิดพลาดในการผูกอุปกรณ์" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/v1/devices/pair?id=...
 * ยกเลิกการผูกอุปกรณ์ 2FA
 */
export async function DELETE(request) {
  const startTime = Date.now();
  const { searchParams } = new URL(request.url);
  const deviceId = searchParams.get("id");

  if (!deviceId) {
    return NextResponse.json(
      { error: "กรุณาระบุ id ของอุปกรณ์ที่ต้องการลบ" },
      { status: 400 }
    );
  }

  try {
    const user = await currentUser(request);
    if (!user) return NextResponse.json({error: "Unauthorized"}, {status: 401});
    const existing = await prisma.userDevice.findUnique({
      where: { id: deviceId },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "ไม่พบอุปกรณ์ที่ต้องการลบ" },
        { status: 404 }
      );
    }

    if (existing.userId !== user.id) return NextResponse.json({error: "Forbidden"}, {status: 403});

    if (existing.isVerified) {
      await prisma.$transaction([
        prisma.userDevice.update({where:{id:deviceId},data:{isVerified:false,fcmToken:""}}),
        prisma.authChallenge.updateMany({where:{deviceId,status:"PENDING"},data:{status:"REJECTED",respondedAt:new Date()}}),
        prisma.userSession.updateMany({where:{deviceId,isActive:true},data:{isActive:false,revokedAt:new Date(),revokedReason:"Device unpaired"}}),
      ]);
    } else {
      await prisma.userDevice.delete({where:{id:deviceId}});
    }

    await recordAuditAndSessionLog({
      request,
      userId: existing.userId,
      action: "DEVICE_REVOKED",
      eventType: "DEVICE_REVOKED",
      category: "DEVICE",
      status: "SUCCESS",
      severity: "WARNING",
      statusCode: 200,
      responseTimeMs: Date.now() - startTime,
      metadata: {
        deletedDeviceId: existing.id,
        deviceName: existing.deviceName,
      },
    });

    return NextResponse.json({
      status: existing.isVerified ? "UNPAIRED" : "DELETED",
      message: "ยกเลิกการผูกอุปกรณ์เรียบร้อยแล้ว",
    });
  } catch (error) {
    console.error("[Devices Pair DELETE Error]:", error);
    return NextResponse.json(
      { error: "ไม่สามารถลบอุปกรณ์ได้" },
      { status: 500 }
    );
  }
}

