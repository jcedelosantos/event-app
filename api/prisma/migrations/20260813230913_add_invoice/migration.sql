-- CreateTable
CREATE TABLE "Invoice" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "ncf" TEXT,
    "billingPeriod" TEXT NOT NULL,
    "planCode" TEXT,
    "planPriceUSD" DOUBLE PRECISION NOT NULL,
    "overageUSD" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalUSD" DOUBLE PRECISION NOT NULL,
    "pdfUrl" TEXT NOT NULL,
    "generatedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Invoice_tenantId_idx" ON "Invoice"("tenantId");

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
