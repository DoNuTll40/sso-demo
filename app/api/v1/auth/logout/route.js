import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { recordAuditAndSessionLog } from "@/lib/audit";

/**
 * POST /api/v1/auth/logout
 * ออกจากระบบ เคลียร์ sessionToken ในฐานข้อมูล และลบ Cookie sso_session
 */
export async function POST(request) {
  const sessionToken = request.cookies.get("sso_session")?.value;

  if (sessionToken) {
    try {
      const activeSession = await prisma.userSession.findUnique({
        where: { sessionToken },
      });

      if (activeSession) {
        await prisma.userSession.update({
          where: { sessionToken },
          data: { isActive: false },
        });

        await recordAuditAndSessionLog({
          request,
          userId: activeSession.userId,
          userSessionId: activeSession.id,
          action: "AUTH_LOGOUT",
          eventType: "LOGOUT",
          category: "AUTH",
          status: "SUCCESS",
          severity: "INFO",
        });
      }
    } catch (err) {
      console.error("[Logout Error]:", err);
    }
  }

  const response = NextResponse.json({
    status: "LOGGED_OUT",
    message: "ออกจากระบบเรียบร้อยแล้ว",
  });

  response.cookies.delete("sso_session");

  return response;
}

