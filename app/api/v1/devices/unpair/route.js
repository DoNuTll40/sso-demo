import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyDeviceProof } from "@/lib/device-proof";
export async function POST(request) {
  const {deviceId, timestamp, signature} = await request.json();
  if (!Number.isSafeInteger(timestamp) || Math.abs(Date.now() - timestamp) > 60000) return NextResponse.json({error: "Expired request"}, {status: 401});
  const device = typeof deviceId === "string" ? await prisma.userDevice.findUnique({where: {id: deviceId}}) : null;
  if (!device || !verifyDeviceProof(device.publicKey, JSON.stringify(["sso-unpair-v1", deviceId, timestamp]), signature)) return NextResponse.json({error: "Unauthorized"}, {status: 401});
  await prisma.$transaction([
    prisma.userDevice.update({where: {id: deviceId}, data: {isVerified: false, fcmToken: ""}}),
    prisma.authChallenge.updateMany({where: {deviceId, status: "PENDING"}, data: {status: "REJECTED", respondedAt: new Date()}}),
  ]);
  return NextResponse.json({status: "UNPAIRED"});
}
