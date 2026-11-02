import prisma from "@/lib/prisma";
import { NextResponse } from "next/server";
export async function currentUser(request) {
  const sessionToken = request.cookies.get("sso_session")?.value;
  if (!sessionToken) return null;
  const session = await prisma.userSession.findUnique({where: {sessionToken}, include: {user: true}});
  return session?.isActive && session.expiresAt > new Date() ? session.user : null;
}
export async function requireAdmin(request) {
  const user = await currentUser(request);
  return user?.role === "ADMIN" ? null : NextResponse.json({error: user ? "Forbidden" : "Unauthorized"}, {status: user ? 403 : 401});
}
