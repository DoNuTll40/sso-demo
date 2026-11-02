require("dotenv/config");
const bcrypt = require("bcryptjs");
const { PrismaClient } = require("../lib/generated/prisma");

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Starting database seed...");

  // 1. สร้าง User ระดับ ADMIN
  const passwordHash = await bcrypt.hash("admin1234", 10);

  const adminUser = await prisma.user.upsert({
    where: { username: "admin" },
    update: {
      email: "admin@example.com",
      fullName: "System Administrator",
      passwordHash,
      role: "ADMIN",
    },
    create: {
      username: "admin",
      email: "admin@example.com",
      fullName: "System Administrator",
      passwordHash,
      role: "ADMIN",
    },
  });

  console.log("✅ Seeded Admin User:", {
    id: adminUser.id,
    username: adminUser.username,
    email: adminUser.email,
    role: adminUser.role,
  });

  // 2. สร้างตัวอย่าง OAuthClient สำหรับทดสอบ (Test Web App)
  const clientSecretHash = await bcrypt.hash("secret1234", 10);

  const testClient = await prisma.oAuthClient.upsert({
    where: { clientId: "test-client-web" },
    update: {
      clientSecret: clientSecretHash,
      clientName: "Demo Web Portal",
      redirectUris: [
        "http://localhost:3000/api/auth/callback/custom-sso",
        "https://oauth.pstmn.io/v1/callback",
      ],
      allowedScopes: ["openid", "profile", "email"],
      isPublic: false,
    },
    create: {
      clientId: "test-client-web",
      clientSecret: clientSecretHash,
      clientName: "Demo Web Portal",
      redirectUris: [
        "http://localhost:3000/api/auth/callback/custom-sso",
        "https://oauth.pstmn.io/v1/callback",
      ],
      allowedScopes: ["openid", "profile", "email"],
      isPublic: false,
    },
  });

  console.log("✅ Seeded OAuth Client:", {
    id: testClient.id,
    clientId: testClient.clientId,
    clientName: testClient.clientName,
    redirectUris: testClient.redirectUris,
  });

  // 3. บันทึก Audit Log เริ่มต้นสำหรับการ Seed
  await prisma.auditLog.create({
    data: {
      userId: adminUser.id,
      clientId: testClient.id,
      action: "SYSTEM_SEED_COMPLETED",
      category: "ADMIN",
      status: "SUCCESS",
      severity: "INFO",
      reason: "Initial database seed for Admin user and Test OAuth Client",
      metadata: {
        adminUsername: adminUser.username,
        oauthClientId: testClient.clientId,
      },
    },
  });

  console.log("🎉 Database seed completed successfully!");
}

main()
  .catch((e) => {
    console.error("❌ Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

