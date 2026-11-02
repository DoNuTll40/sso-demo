import crypto from "crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import prisma from "@/lib/prisma";
import { currentUser } from "@/lib/session-auth";
import { NextResponse } from "next/server";
const reply = (body, status=200) => NextResponse.json(body, {status, headers:{"Cache-Control":"no-store"}});
export async function POST(request) {
  const body = await request.json();
  if (body.action === "generate") {
    const user = await currentUser(request);
    if (!user) return reply({error:"Unauthorized"},401);
    if (typeof body.password !== "string" || !await bcrypt.compare(body.password,user.passwordHash)) return reply({error:"รหัสผ่านไม่ถูกต้อง"},401);
    const codes = Array.from({length:10},()=>crypto.randomBytes(10).toString("hex"));
    await prisma.$transaction(async tx=>{
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${user.id}))::text`;
      await tx.$executeRaw`DELETE FROM "RecoveryCode" WHERE "userId"=${user.id}`;
      for(const code of codes) await tx.$executeRaw`INSERT INTO "RecoveryCode" ("hash","userId") VALUES (${crypto.createHash("sha256").update(code).digest("hex")},${user.id})`;
      await tx.auditLog.create({data:{userId:user.id,action:"RECOVERY_CODES_GENERATED",category:"2FA"}});
    });
    return reply({codes});
  }
  let proof;
  try { proof=jwt.verify(request.cookies.get("sso_challenge")?.value||"",process.env.JWT_SECRET,{algorithms:["HS256"]}); } catch {return reply({error:"กรุณาเข้าสู่ระบบใหม่"},401);}
  if(proof.purpose!=="challenge_browser" || proof.sub!==body.challengeId) return reply({error:"Unauthorized"},401);
  return prisma.$transaction(async tx=>{
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${body.challengeId}))::text`;
    const challenge=await tx.authChallenge.findUnique({where:{id:body.challengeId},include:{authSession:true}});
    if(!challenge || challenge.status!=="PENDING" || challenge.expiresAt<new Date()) return reply({error:"คำขอหมดอายุ กรุณาเข้าสู่ระบบใหม่"},400);
    const userId=challenge.authSession.userId;
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))::text`;
    const attempts=await tx.auditLog.count({where:{userId,action:"RECOVERY_FAILED",createdAt:{gt:new Date(Date.now()-15*60000)}}});
    if(attempts>=5) return reply({error:"ลองผิดหลายครั้ง กรุณารอ 15 นาที"},429);
    const code=typeof body.code==="string" ? body.code.trim().toLowerCase():"";
    const hash=crypto.createHash("sha256").update(code).digest("hex");
    const count=await tx.$executeRaw`DELETE FROM "RecoveryCode" WHERE "userId"=${userId} AND "hash"=${hash}`;
    if(count!==1){await tx.auditLog.create({data:{userId,action:"RECOVERY_FAILED",category:"2FA",status:"FAILURE"}});return reply({error:"รหัสไม่ถูกต้องหรือใช้แล้ว"},400);}
    await tx.authChallenge.update({where:{id:challenge.id},data:{status:"APPROVED",respondedAt:new Date()}});
    await tx.auditLog.create({data:{userId,action:"RECOVERY_CODE_USED",category:"2FA",severity:"WARNING"}});
    return reply({ok:true});
  });
}
