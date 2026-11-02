import prisma from "../lib/prisma.js";

async function runCheck() {
  console.log("=== SSO CORE & 2FA SYSTEM HEALTH CHECK ===");
  try {
    const startTime = Date.now();
    await prisma.$queryRaw`SELECT 1 as connected`;
    const pingTime = Date.now() - startTime;
    console.log(`[Database] Neon PostgreSQL: Connected (${pingTime}ms)`);

    const [userCount, clientCount, deviceCount, sessionCount, tokenCount, auditLogCount] = await Promise.all([
      prisma.user.count(),
      prisma.oAuthClient.count(),
      prisma.userDevice.count(),
      prisma.userSession.count(),
      prisma.oAuthToken.count(),
      prisma.auditLog.count(),
    ]);

    console.log(`[Data Counts]:`);
    console.log(`  - Users: ${userCount}`);
    console.log(`  - OAuth Clients: ${clientCount}`);
    console.log(`  - Paired 2FA Devices: ${deviceCount}`);
    console.log(`  - User Sessions: ${sessionCount}`);
    console.log(`  - Active OAuth Tokens: ${tokenCount}`);
    console.log(`  - Audit & Access Logs: ${auditLogCount}`);

    const users = await prisma.user.findMany({
      select: {
        username: true,
        email: true,
        role: true,
        _count: { select: { devices: true } },
      },
      take: 5,
    });
    console.log(`[Recent Users]:`, JSON.stringify(users, null, 2));

    const clients = await prisma.oAuthClient.findMany({
      select: {
        clientId: true,
        clientName: true,
        isPublic: true,
        redirectUris: true,
        allowedScopes: true,
      },
      take: 5,
    });
    console.log(`[Registered OAuth Clients]:`, JSON.stringify(clients, null, 2));

    console.log("[Status] System Database & Models: HEALTHY & READY");
  } catch (error) {
    console.error("[Database Connection Error]:", error);
  } finally {
    await prisma.$disconnect();
  }
}

runCheck();
