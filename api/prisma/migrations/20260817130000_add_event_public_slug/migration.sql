-- AlterTable: nullable first so existing rows can be backfilled before enforcing NOT NULL/UNIQUE.
ALTER TABLE "Event" ADD COLUMN "publicSlug" TEXT;

-- Backfill: one random unique token per existing event. Uses only core Postgres functions
-- (random/clock_timestamp/md5) so it doesn't depend on the pgcrypto extension being enabled.
UPDATE "Event"
SET "publicSlug" = substr(md5(random()::text || clock_timestamp()::text || "id"::text), 1, 12)
WHERE "publicSlug" IS NULL;

-- AlterTable
ALTER TABLE "Event" ALTER COLUMN "publicSlug" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Event_publicSlug_key" ON "Event"("publicSlug");
