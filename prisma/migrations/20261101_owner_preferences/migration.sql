ALTER TABLE "OAuthClient" ADD COLUMN IF NOT EXISTS "ownerId" TEXT;
CREATE INDEX IF NOT EXISTS "OAuthClient_ownerId_idx" ON "OAuthClient"("ownerId");
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OAuthClient_ownerId_fkey') THEN
    ALTER TABLE "OAuthClient" ADD CONSTRAINT "OAuthClient_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
CREATE TABLE IF NOT EXISTS "UserPreference" (
  "userId" TEXT PRIMARY KEY REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "settings" JSONB NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- Only backfill owners when a recorded creator exists. Unattributed legacy clients remain unowned.
UPDATE "OAuthClient" c SET "ownerId" = a."userId"
FROM (SELECT DISTINCT ON ("clientId") "clientId", "userId" FROM "AuditLog" WHERE "action" = 'OAUTH_CLIENT_CREATED' AND "userId" IS NOT NULL ORDER BY "clientId", "createdAt") a
WHERE c."id" = a."clientId" AND c."ownerId" IS NULL;
