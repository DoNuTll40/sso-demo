import prisma from "@/lib/prisma";
export async function ownedClientIds(userId) {
  const rows = await prisma.$queryRaw`SELECT "id" FROM "OAuthClient" WHERE "ownerId" = ${userId}`;
  return rows.map(row => row.id);
}
export async function ownsClient(id, userId) {
  if (typeof id !== "string") return false;
  const rows = await prisma.$queryRaw`SELECT "id" FROM "OAuthClient" WHERE "id" = ${id} AND "ownerId" = ${userId}`;
  return rows.length === 1;
}
export function publicClient({clientSecret, ...client}) { return client; }
