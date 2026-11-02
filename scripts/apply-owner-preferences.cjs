const path = require("node:path");
const fs = require("node:fs");
const root = path.resolve(__dirname, "..");
require("@next/env").loadEnvConfig(root);
const {PrismaClient} = require("../lib/generated/prisma");
const db = new PrismaClient();
(async () => {
  try {
    let sql = fs.readFileSync(path.join(root, "prisma/migrations/20261101_owner_preferences/migration.sql"), "utf8");
    const blocks = [];
    sql = sql.replace(/DO \$\$[\s\S]*?END \$\$;/g, block => { blocks.push(block); return `__BLOCK_${blocks.length - 1}__;`; });
    const statements = sql.split(";").map(s => s.trim()).filter(Boolean).map(s => /^__BLOCK_/.test(s) ? blocks[Number(s.match(/\d+/)[0])] : s);
    await db.$transaction(async tx => { for (const statement of statements) await tx.$executeRawUnsafe(statement); });
    console.log("Ownership and preferences schema is ready.");
  } finally { await db.$disconnect(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
