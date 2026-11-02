import { requireAdmin } from "@/lib/session-auth";
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";
import { recordAuditAndSessionLog } from "@/lib/audit";
import { getGravatarUrl } from "@/lib/gravatar";

/**
 * GET /api/v1/admin/users
 * ดึงรายชื่อผู้ใช้ทั้งหมด พร้อมจำนวนอุปกรณ์ 2FA และเซสชัน
 */
export async function GET(request) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search")?.trim() || "";
    const roleFilter = searchParams.get("role")?.trim() || "";

    const where = {};

    if (roleFilter && roleFilter !== "ALL") {
      where.role = roleFilter;
    }

    if (search) {
      where.OR = [
        { username: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { fullName: { contains: search, mode: "insensitive" } },
      ];
    }

    const rawUsers = await prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        username: true,
        email: true,
        fullName: true,
        avatarUrl: true,
        role: true,
        createdAt: true,
        updatedAt: true,
        devices: {
          select: {
            id: true,
            deviceName: true,
            isVerified: true,
            lastUsedAt: true,
          },
        },
        _count: {
          select: {
            devices: true,
            userSessions: true,
            tokens: true,
          },
        },
      },
    });

    const users = rawUsers.map((u) => ({
      ...u,
      avatarUrl: u.avatarUrl || getGravatarUrl(u.email, 128),
    }));

    return NextResponse.json({ users });
  } catch (error) {
    console.error("[Admin Users GET Error]:", error);
    return NextResponse.json(
      { error: "ไม่สามารถดึงรายชื่อผู้ใช้ได้" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/v1/admin/users
 * สร้างผู้ใช้งานใหม่
 */
export async function POST(request) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const startTime = Date.now();

  try {
    const body = await request.json();
    const { username, email, fullName, password, role = "USER" } = body;

    if (!username || !email || !fullName || !password) {
      return NextResponse.json(
        { error: "กรุณากรอกข้อมูล Username, Email, ชื่อ-นามสกุล และรหัสผ่านให้ครบถ้วน" },
        { status: 400 }
      );
    }

    // ตรวจสอบ Username หรือ Email ซ้ำ
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { username: username.trim().toLowerCase() },
          { email: email.trim().toLowerCase() },
        ],
      },
    });

    if (existingUser) {
      const isUsernameDuplicate =
        existingUser.username.toLowerCase() === username.trim().toLowerCase();
      return NextResponse.json(
        {
          error: isUsernameDuplicate
            ? "Username นี้ถูกใช้งานแล้ว"
            : "Email นี้ถูกใช้งานแล้วในระบบ",
        },
        { status: 409 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const newUser = await prisma.user.create({
      data: {
        username: username.trim().toLowerCase(),
        email: email.trim().toLowerCase(),
        fullName: fullName.trim(),
        passwordHash,
        role: role === "ADMIN" ? "ADMIN" : "USER",
      },
      select: {
        id: true,
        username: true,
        email: true,
        fullName: true,
        role: true,
        createdAt: true,
      },
    });

    await recordAuditAndSessionLog({
      request,
      userId: newUser.id,
      action: "USER_CREATED",
      eventType: "USER_REGISTERED",
      category: "ADMIN",
      status: "SUCCESS",
      severity: "INFO",
      statusCode: 201,
      responseTimeMs: Date.now() - startTime,
      metadata: {
        username: newUser.username,
        email: newUser.email,
        role: newUser.role,
      },
    });

    return NextResponse.json(
      {
        user: newUser,
        message: "สร้างผู้ใช้งานใหม่เรียบร้อยแล้ว",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[Admin Users POST Error]:", error);
    return NextResponse.json(
      { error: "เกิดข้อผิดพลาดในการสร้างผู้ใช้งาน" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/v1/admin/users
 * แก้ไขข้อมูลผู้ใช้ หรือรีเซ็ตรหัสผ่าน
 */
export async function PUT(request) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const startTime = Date.now();

  try {
    const body = await request.json();
    const { id, fullName, email, role, password, action } = body;

    if (!id) {
      return NextResponse.json(
        { error: "กรุณาระบุ id ของผู้ใช้" },
        { status: 400 }
      );
    }

    const existingUser = await prisma.user.findUnique({
      where: { id },
    });

    if (!existingUser) {
      return NextResponse.json(
        { error: "ไม่พบผู้ใช้งานนี้ในระบบ" },
        { status: 404 }
      );
    }

    // กรณีรีเซ็ตรหัสผ่านอย่างเดียว
    if (action === "reset_password") {
      if (!password || password.length < 6) {
        return NextResponse.json(
          { error: "รหัสผ่านใหม่ต้องมีความยาวอย่างน้อย 6 ตัวอักษร" },
          { status: 400 }
        );
      }

      const passwordHash = await bcrypt.hash(password, 10);

      await prisma.user.update({
        where: { id },
        data: { passwordHash },
      });

      await recordAuditAndSessionLog({
        request,
        userId: id,
        action: "USER_PASSWORD_RESET",
        eventType: "PASSWORD_RESET_BY_ADMIN",
        category: "ADMIN",
        status: "SUCCESS",
        severity: "WARNING",
        statusCode: 200,
        responseTimeMs: Date.now() - startTime,
        metadata: { username: existingUser.username },
      });

      return NextResponse.json({
        message: `รีเซ็ตรหัสผ่านสำหรับ "${existingUser.username}" เรียบร้อยแล้ว`,
      });
    }

    // กรณีแก้ไขข้อมูลทั่วไป
    const updateData = {};
    if (fullName) updateData.fullName = fullName.trim();
    if (role && (role === "ADMIN" || role === "USER")) {
      updateData.role = role;
    }
    if (email && email.trim().toLowerCase() !== existingUser.email.toLowerCase()) {
      // ตรวจสอบ Email ซ้ำ
      const duplicateEmail = await prisma.user.findUnique({
        where: { email: email.trim().toLowerCase() },
      });
      if (duplicateEmail) {
        return NextResponse.json(
          { error: "Email นี้ถูกใช้งานแล้วโดยผู้ใช้อื่น" },
          { status: 409 }
        );
      }
      updateData.email = email.trim().toLowerCase();
    }

    // ถ้ามีการส่ง password มาพร้อมแก้ไขข้อมูล
    if (password && password.length >= 6) {
      updateData.passwordHash = await bcrypt.hash(password, 10);
    }

    const updatedUser = await prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        username: true,
        email: true,
        fullName: true,
        role: true,
        updatedAt: true,
      },
    });

    await recordAuditAndSessionLog({
      request,
      userId: id,
      action: "USER_UPDATED",
      eventType: "USER_PROFILE_UPDATED",
      category: "ADMIN",
      status: "SUCCESS",
      severity: "INFO",
      statusCode: 200,
      responseTimeMs: Date.now() - startTime,
      metadata: updateData,
    });

    return NextResponse.json({
      user: updatedUser,
      message: "อัปเดตข้อมูลผู้ใช้เรียบร้อยแล้ว",
    });
  } catch (error) {
    console.error("[Admin Users PUT Error]:", error);
    return NextResponse.json(
      { error: "เกิดข้อผิดพลาดในการอัปเดตข้อมูลผู้ใช้" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/v1/admin/users?id=...
 * ลบผู้ใช้งานออกจากระบบ
 */
export async function DELETE(request) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const startTime = Date.now();
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json(
      { error: "กรุณาระบุ id ของผู้ใช้" },
      { status: 400 }
    );
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      return NextResponse.json(
        { error: "ไม่พบผู้ใช้นี้ในระบบ" },
        { status: 404 }
      );
    }

    // ป้องกันการลบ Admin บัญชีสุดท้าย
    if (user.role === "ADMIN") {
      const adminCount = await prisma.user.count({
        where: { role: "ADMIN" },
      });
      if (adminCount <= 1) {
        return NextResponse.json(
          { error: "ไม่สามารถลบ Admin บัญชีสุดท้ายของระบบได้" },
          { status: 400 }
        );
      }
    }

    // ลบความสัมพันธ์ทั้งหมดของ User ก่อนลบตัว User (หาก DB ไม่ได้ cascade ทุกตาราง)
    await prisma.$transaction([
      prisma.sessionAccessLog.deleteMany({ where: { userId: id } }),
      prisma.auditLog.deleteMany({ where: { userId: id } }),
      prisma.oAuthToken.deleteMany({ where: { userId: id } }),
      prisma.userSession.deleteMany({ where: { userId: id } }),
      prisma.authSession.deleteMany({ where: { userId: id } }),
      prisma.userDevice.deleteMany({ where: { userId: id } }),
      prisma.user.delete({ where: { id } }),
    ]);

    await recordAuditAndSessionLog({
      request,
      userId: id,
      action: "USER_DELETED",
      eventType: "USER_REMOVED",
      category: "ADMIN",
      status: "SUCCESS",
      severity: "WARNING",
      statusCode: 200,
      responseTimeMs: Date.now() - startTime,
      metadata: { username: user.username, email: user.email },
    });

    return NextResponse.json({ status: "DELETED", message: "ลบผู้ใช้สำเร็จ" });
  } catch (error) {
    console.error("[Admin Users DELETE Error]:", error);
    return NextResponse.json(
      { error: "ไม่สามารถลบผู้ใช้งานได้" },
      { status: 500 }
    );
  }
}

