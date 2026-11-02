import { currentUser } from "@/lib/session-auth";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getGravatarUrl } from "@/lib/gravatar";

/**
 * GET /api/v1/auth/me
 * ดึงข้อมูลผู้ใช้ปัจจุบันที่กำลังล็อกอินอยู่จาก sso_session cookie
 */
export async function GET(request) {
  try {
    const user = await currentUser(request);

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized", user: null },
        { status: 401 }
      );
    }

    const avatarUrl = user.avatarUrl || getGravatarUrl(user.email, 128);

    return NextResponse.json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        avatarUrl,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    console.error("[Auth ME Error]:", error);
    return NextResponse.json(
      { error: "Failed to fetch user session" },
      { status: 500 }
    );
  }
}

