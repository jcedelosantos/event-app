-- CreateTable
CREATE TABLE "EventTransaction" (
    "id" SERIAL NOT NULL,
    "type" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "amountCents" INTEGER NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "eventId" INTEGER NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "serviceRequestId" INTEGER,

    CONSTRAINT "EventTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EventTransaction_serviceRequestId_key" ON "EventTransaction"("serviceRequestId");

-- CreateIndex
CREATE INDEX "EventTransaction_tenantId_idx" ON "EventTransaction"("tenantId");

-- CreateIndex
CREATE INDEX "EventTransaction_eventId_idx" ON "EventTransaction"("eventId");

-- AddForeignKey
ALTER TABLE "EventTransaction" ADD CONSTRAINT "EventTransaction_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventTransaction" ADD CONSTRAINT "EventTransaction_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventTransaction" ADD CONSTRAINT "EventTransaction_serviceRequestId_fkey" FOREIGN KEY ("serviceRequestId") REFERENCES "ServiceRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
