-- AlterTable
ALTER TABLE "Event" ADD COLUMN "duplicateGroupKey" TEXT;

-- CreateIndex
CREATE INDEX "Event_tenantId_duplicateGroupKey_idx" ON "Event"("tenantId", "duplicateGroupKey");
