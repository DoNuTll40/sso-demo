import prisma from "@/lib/prisma";
import { normalizeSettings } from "@/lib/console-settings";
export async function storedPreferences(userId) {
  const rows = await prisma.$queryRaw`SELECT "settings" FROM "UserPreference" WHERE "userId" = ${userId}`;
  return rows[0] ? normalizeSettings(rows[0].settings) : null;
}
export async function userPreferences(userId) { return normalizeSettings(userId ? await storedPreferences(userId) || {} : {}); }
export async function savePreferences(userId, input) {
  const settings = normalizeSettings(input);
  await prisma.$executeRaw`INSERT INTO "UserPreference" ("userId", "settings", "updatedAt") VALUES (${userId}, ${JSON.stringify(settings)}::jsonb, NOW()) ON CONFLICT ("userId") DO UPDATE SET "settings" = EXCLUDED."settings", "updatedAt" = NOW()`;
  return settings;
}
