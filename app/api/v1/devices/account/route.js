import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyDeviceProof } from "@/lib/device-proof";
export async function POST(request) {
  const {deviceId, timestamp, signature} = await request.json();
  if (!Number.isSafeInteger(timestamp) || Math.abs(Date.now() - timestamp) > 60000) return NextResponse.json({error: "Expired request"}, {status: 401});
  const device = typeof deviceId === "string" ? await prisma.userDevice.findUnique({where: {id: deviceId}}) : null;
  if (!device?.isVerified || !verifyDeviceProof(device.publicKey, JSON.stringify(["sso-account-v1", deviceId, timestamp]), signature)) return NextResponse.json({error: "Unauthorized"}, {status: 401});
  const [user, tokens, history, sessions] = await Promise.all([
    prisma.user.findUnique({where: {id: device.userId}, select: {id:true, username:true, fullName:true, email:true}}),
    prisma.oAuthToken.findMany({where: {userId: device.userId, isRevoked:false, expiresAt:{gt:new Date()}}, select: {scope:true,lastUsedAt:true,createdAt:true,client:{select:{id:true,clientName:true}}}, orderBy:{createdAt:"desc"},take:100}),
    prisma.auditLog.findMany({where:{userId:device.userId,category:{in:["AUTH","2FA","OAUTH"]}},select:{id:true,action:true,status:true,createdAt:true,ipAddress:true,client:{select:{clientName:true}}},orderBy:{createdAt:"desc"},take:50}),
    prisma.userSession.findMany({where:{userId:device.userId,isActive:true,expiresAt:{gt:new Date()}},select:{id:true,deviceInfo:true,ipAddress:true,createdAt:true,lastActiveAt:true,mfaVerified:true},orderBy:{createdAt:"desc"},take:20}),
  ]);
  const apps = new Map();
  for (const token of tokens) {
    const item = apps.get(token.client.id) || {id:token.client.id,name:token.client.clientName,scopes:[],lastUsedAt:token.lastUsedAt || token.createdAt};
    item.scopes = [...new Set([...item.scopes,...token.scope.split(/\s+/).filter(Boolean)])];
    if ((token.lastUsedAt || token.createdAt) > item.lastUsedAt) item.lastUsedAt = token.lastUsedAt || token.createdAt;
    apps.set(item.id,item);
  }
  return NextResponse.json({user,device:{id:device.id,name:device.deviceName,pairedAt:device.createdAt},apps:[...apps.values()],history,sessions}, {headers:{"Cache-Control":"no-store"}});
}
