-- CreateTable
CREATE TABLE "ScanConflict" (
    "id" SERIAL NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" INTEGER NOT NULL,
    "codeQR" TEXT NOT NULL,
    "attemptedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "accessPointId" INTEGER,
    "tenantId" INTEGER NOT NULL,

    CONSTRAINT "ScanConflict_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScanConflict_tenantId_idx" ON "ScanConflict"("tenantId");

-- AddForeignKey
ALTER TABLE "ScanConflict" ADD CONSTRAINT "ScanConflict_accessPointId_fkey" FOREIGN KEY ("accessPointId") REFERENCES "AccessPoint"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScanConflict" ADD CONSTRAINT "ScanConflict_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
