import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
export async function GET(request) {
  const id = new URL(request.url).searchParams.get("session_id");
  const headers = {"Cache-Control":"no-store"};
  if (!id || id.length > 100) return NextResponse.json({error:"คำขอไม่ถูกต้อง"},{status:400,headers});
  const session = await prisma.authSession.findUnique({where:{id},select:{expiresAt:true,status:true,client:{select:{clientName:true}}}});
  if (!session || session.expiresAt <= new Date() || !["PENDING","AWAITING_CONSENT"].includes(session.status)) return NextResponse.json({error:"คำขอหมดอายุหรือใช้งานไม่ได้ กรุณาเริ่มเข้าสู่ระบบจากแอปอีกครั้ง"},{status:400,headers});
  return NextResponse.json({clientName:session.client.clientName},{headers});
}
