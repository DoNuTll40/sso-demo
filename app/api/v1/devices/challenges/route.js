import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyDeviceProof } from "@/lib/device-proof";
export async function POST(request) {
  const {deviceId, timestamp, signature} = await request.json();
  if (!Number.isSafeInteger(timestamp) || Math.abs(Date.now() - timestamp) > 60000) return NextResponse.json({error: "Expired request"}, {status: 401});
  const device = typeof deviceId === "string" ? await prisma.userDevice.findUnique({where: {id: deviceId}}) : null;
  if (!device?.isVerified || !verifyDeviceProof(device.publicKey, JSON.stringify(["sso-poll-v1", deviceId, timestamp]), signature)) return NextResponse.json({error: "Unauthorized"}, {status: 401});
  const pending = await prisma.authChallenge.findMany({where: {deviceId, status: "PENDING", expiresAt: {gt: new Date()}}, include: {authSession: {include: {client: true}}}, orderBy: {createdAt: "desc"}, take: 5});
  const challenges = pending.map(c => {
    const code = Number(c.challengeCode);
    const options = [code, ((code - 10 + 31) % 90) + 10, ((code - 10 + 61) % 90) + 10].sort((a,b) => a-b);
    return {id: c.id, nonce: c.nonce, serviceName: c.authSession.client.clientName, ipAddress: c.ipAddress, browser: c.userAgent, requestedAt: c.createdAt.toISOString(), expiresAt: c.expiresAt.toISOString(), matchingOptions: options};
  });
  return NextResponse.json({challenges}, {headers: {"Cache-Control": "no-store"}});
}
