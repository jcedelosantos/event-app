-- DropIndex
DROP INDEX "Child_codeQR_key";

-- CreateIndex
CREATE INDEX "Child_codeQR_idx" ON "Child"("codeQR");

-- CreateIndex
CREATE INDEX "Child_parentId_eventId_idx" ON "Child"("parentId", "eventId");
