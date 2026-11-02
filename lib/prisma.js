import { PrismaClient } from "./generated/prisma/index.js";

const globalForPrisma = globalThis;

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    // ปิด "query" log เพื่อให้ Terminal สะอาด ไม่แสดงคำสั่ง SQL ทุกครั้งที่เรียก API
    log: process.env.NODE_ENV === "development" ? ["warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export default prisma;
