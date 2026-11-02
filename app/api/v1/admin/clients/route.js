import { ownedClientIds, ownsClient, publicClient } from "@/lib/client-ownership";
import { currentUser } from "@/lib/session-auth";
import { NextResponse } from "next/server";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";
import { recordAuditAndSessionLog } from "@/lib/audit";

/**
 * GET /api/v1/admin/clients
 * ดึงรายการ OAuthClient ทั้งหมดสำหรับแสดงบนหน้า Admin
 */
export async function GET(request) {
  const user = await currentUser(request);
  if (!user) return NextResponse.json({error: "Unauthorized"}, {status: 401});
  if (user.role !== "ADMIN") return NextResponse.json({error: "Forbidden"}, {status: 403});
  try {
    const clients = await prisma.oAuthClient.findMany({
      where: {id: {in: await ownedClientIds(user.id)}},
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ clients: clients.map(publicClient) });
  } catch (error) {
    console.error("[Admin Clients GET Error]:", error);
    return NextResponse.json(
      { error: "ไม่สามารถดึงข้อมูล OAuth Clients ได้" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/v1/admin/clients
 * ลงทะเบียน OAuthClient ใหม่ พร้อมสร้าง clientId และ clientSecret
 */
export async function POST(request) {
  const user = await currentUser(request);
  if (!user) return NextResponse.json({error: "Unauthorized"}, {status: 401});
  if (user.role !== "ADMIN") return NextResponse.json({error: "Forbidden"}, {status: 403});
  const startTime = Date.now();

  try {
    const body = await request.json();
    const {
      clientName,
      clientId: customClientId,
      redirectUris,
      allowedScopes,
      isPublic = false,
    } = body;

    if (!clientName || !redirectUris || redirectUris.length === 0) {
      return NextResponse.json(
        { error: "กรุณาระบุชื่อแอปพลิเคชันและ Redirect URI อย่างน้อย 1 รายการ" },
        { status: 400 }
      );
    }

    const generatedClientId =
      customClientId?.trim() ||
      `client_${crypto.randomBytes(6).toString("hex")}`;

    const rawSecret = isPublic
      ? null
      : `sec_${crypto.randomBytes(20).toString("hex")}`;

    const hashedSecret = rawSecret ? await bcrypt.hash(rawSecret, 10) : null;

    const scopesArray =
      Array.isArray(allowedScopes) && allowedScopes.length > 0
        ? allowedScopes
        : ["openid", "profile", "email"];

    const urisArray = Array.isArray(redirectUris)
      ? redirectUris.map((u) => u.trim()).filter(Boolean)
      : String(redirectUris)
          .split(",")
          .map((u) => u.trim())
          .filter(Boolean);

    const newClient = await prisma.$transaction(async (tx) => {
    const created = await tx.oAuthClient.create({
      data: {
        clientId: generatedClientId,
        clientSecret: hashedSecret,
        clientName: clientName.trim(),
        redirectUris: urisArray,
        allowedScopes: scopesArray,
        isPublic: Boolean(isPublic),
      },
    });
      await tx.$executeRaw`UPDATE "OAuthClient" SET "ownerId" = ${user.id} WHERE "id" = ${created.id}`;
      return created;
    });

    await recordAuditAndSessionLog({
      request,
      userId: user.id,
      clientId: newClient.id,
      action: "OAUTH_CLIENT_CREATED",
      eventType: "CLIENT_CREATED",
      category: "ADMIN",
      status: "SUCCESS",
      severity: "INFO",
      statusCode: 201,
      responseTimeMs: Date.now() - startTime,
      metadata: {
        clientId: newClient.clientId,
        clientName: newClient.clientName,
        isPublic: newClient.isPublic,
        redirectUris: newClient.redirectUris,
      },
    });

    return NextResponse.json(
      {
        client: publicClient(newClient),
        rawClientSecret: rawSecret,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[Admin Clients POST Error]:", error);
    return NextResponse.json(
      { error: "ไม่สามารถสร้าง OAuth Client ได้ (Client ID อาจซ้ำ)" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/v1/admin/clients
 * แก้ไขข้อมูล OAuthClient หรือสร้าง Client Secret ใหม่ (Regenerate Secret)
 */
export async function PUT(request) {
  const user = await currentUser(request);
  if (!user) return NextResponse.json({error: "Unauthorized"}, {status: 401});
  if (user.role !== "ADMIN") return NextResponse.json({error: "Forbidden"}, {status: 403});
  const startTime = Date.now();

  try {
    const body = await request.json();
    const {
      id,
      clientName,
      redirectUris,
      allowedScopes,
      isPublic,
      action, // 'update' หรือ 'regenerate_secret'
    } = body;

    if (!id) {
      return NextResponse.json(
        { error: "กรุณาระบุ id ของ OAuth Client" },
        { status: 400 }
      );
    }

    if (!(await ownsClient(id, user.id))) return NextResponse.json({error: "ไม่พบ Client ของบัญชีนี้"}, {status: 404});

    const existingClient = await prisma.oAuthClient.findUnique({
      where: { id },
    });

    if (!existingClient) {
      return NextResponse.json(
        { error: "ไม่พบ OAuth Client ในระบบ" },
        { status: 404 }
      );
    }

    // กรณีต้องการ Regenerate Secret อย่างเดียว
    if (action === "regenerate_secret") {
      if (existingClient.isPublic) {
        return NextResponse.json(
          { error: "Public Client (PKCE) ไม่มีการใช้ Client Secret" },
          { status: 400 }
        );
      }

      const rawSecret = `sec_${crypto.randomBytes(20).toString("hex")}`;
      const hashedSecret = await bcrypt.hash(rawSecret, 10);

      const updatedClient = await prisma.oAuthClient.update({
        where: { id },
        data: {
          clientSecret: hashedSecret,
        },
      });

      await recordAuditAndSessionLog({
        request,
      userId: user.id,
        clientId: updatedClient.id,
        action: "OAUTH_CLIENT_SECRET_REGENERATED",
        eventType: "CLIENT_SECRET_REGENERATED",
        category: "ADMIN",
        status: "SUCCESS",
        severity: "WARNING",
        statusCode: 200,
        responseTimeMs: Date.now() - startTime,
        metadata: {
          clientId: updatedClient.clientId,
          clientName: updatedClient.clientName,
        },
      });

      return NextResponse.json({
        client: publicClient(updatedClient),
        rawClientSecret: rawSecret,
        message: "สร้าง Client Secret ใหม่เรียบร้อยแล้ว",
      });
    }

    // กรณีแก้ไขข้อมูลทั่วไป
    const urisArray = Array.isArray(redirectUris)
      ? redirectUris.map((u) => u.trim()).filter(Boolean)
      : typeof redirectUris === "string"
      ? redirectUris
          .split(",")
          .map((u) => u.trim())
          .filter(Boolean)
      : existingClient.redirectUris;

    if (!urisArray || urisArray.length === 0) {
      return NextResponse.json(
        { error: "Redirect URIs ต้องมีอย่างน้อย 1 รายการ" },
        { status: 400 }
      );
    }

    const scopesArray = Array.isArray(allowedScopes)
      ? allowedScopes.map((s) => s.trim()).filter(Boolean)
      : typeof allowedScopes === "string"
      ? allowedScopes
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : existingClient.allowedScopes;

    const newIsPublic =
      isPublic !== undefined ? Boolean(isPublic) : existingClient.isPublic;

    let newHashedSecret = existingClient.clientSecret;
    let newRawSecret = null;

    // ถ้าเปลี่ยนจาก Public -> Confidential และยังไม่มี secret ให้สร้างใหม่
    if (!newIsPublic && !existingClient.clientSecret) {
      newRawSecret = `sec_${crypto.randomBytes(20).toString("hex")}`;
      newHashedSecret = await bcrypt.hash(newRawSecret, 10);
    } else if (newIsPublic) {
      // ถ้าเปลี่ยนเป็น Public ให้ลบ secret ออก
      newHashedSecret = null;
    }

    const updatedClient = await prisma.oAuthClient.update({
      where: { id },
      data: {
        clientName: clientName?.trim() || existingClient.clientName,
        redirectUris: urisArray,
        allowedScopes:
          scopesArray.length > 0
            ? scopesArray
            : ["openid", "profile", "email"],
        isPublic: newIsPublic,
        clientSecret: newHashedSecret,
      },
    });

    await recordAuditAndSessionLog({
      request,
      userId: user.id,
      clientId: updatedClient.id,
      action: "OAUTH_CLIENT_UPDATED",
      eventType: "CLIENT_UPDATED",
      category: "ADMIN",
      status: "SUCCESS",
      severity: "INFO",
      statusCode: 200,
      responseTimeMs: Date.now() - startTime,
      metadata: {
        clientId: updatedClient.clientId,
        clientName: updatedClient.clientName,
        isPublic: updatedClient.isPublic,
        redirectUris: updatedClient.redirectUris,
      },
    });

    return NextResponse.json({
      client: publicClient(updatedClient),
      rawClientSecret: newRawSecret,
      message: "อัปเดตข้อมูล OAuth Client เรียบร้อยแล้ว",
    });
  } catch (error) {
    console.error("[Admin Clients PUT Error]:", error);
    return NextResponse.json(
      { error: "ไม่สามารถอัปเดตข้อมูล OAuth Client ได้" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/v1/admin/clients?id=...
 * ลบรายการ OAuthClient
 */
export async function DELETE(request) {
  const user = await currentUser(request);
  if (!user) return NextResponse.json({error: "Unauthorized"}, {status: 401});
  if (user.role !== "ADMIN") return NextResponse.json({error: "Forbidden"}, {status: 403});
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json(
      { error: "กรุณาระบุ id ของ OAuth Client" },
      { status: 400 }
    );
  }

  try {
    if (!(await ownsClient(id, user.id))) return NextResponse.json({error: "ไม่พบ Client ของบัญชีนี้"}, {status: 404});
    await prisma.oAuthClient.delete({
      where: { id },
    });

    return NextResponse.json({ status: "DELETED" });
  } catch (error) {
    console.error("[Admin Clients DELETE Error]:", error);
    return NextResponse.json(
      { error: "ไม่สามารถลบ OAuth Client ได้" },
      { status: 500 }
    );
  }
}

