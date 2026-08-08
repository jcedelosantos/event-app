-- AlterTable
ALTER TABLE "Child" ADD COLUMN     "accessPointId" INTEGER;

-- AlterTable
ALTER TABLE "SaleTicket" ADD COLUMN     "accessPointId" INTEGER;

-- CreateTable
CREATE TABLE "AccessPoint" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eventId" INTEGER NOT NULL,
    "tenantId" INTEGER NOT NULL,

    CONSTRAINT "AccessPoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessPointTicket" (
    "accessPointId" INTEGER NOT NULL,
    "ticketId" INTEGER NOT NULL,

    CONSTRAINT "AccessPointTicket_pkey" PRIMARY KEY ("accessPointId","ticketId")
);

-- CreateIndex
CREATE INDEX "AccessPoint_tenantId_idx" ON "AccessPoint"("tenantId");

-- CreateIndex
CREATE INDEX "AccessPoint_eventId_idx" ON "AccessPoint"("eventId");

-- AddForeignKey
ALTER TABLE "AccessPoint" ADD CONSTRAINT "AccessPoint_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessPoint" ADD CONSTRAINT "AccessPoint_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessPointTicket" ADD CONSTRAINT "AccessPointTicket_accessPointId_fkey" FOREIGN KEY ("accessPointId") REFERENCES "AccessPoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessPointTicket" ADD CONSTRAINT "AccessPointTicket_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleTicket" ADD CONSTRAINT "SaleTicket_accessPointId_fkey" FOREIGN KEY ("accessPointId") REFERENCES "AccessPoint"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Child" ADD CONSTRAINT "Child_accessPointId_fkey" FOREIGN KEY ("accessPointId") REFERENCES "AccessPoint"("id") ON DELETE SET NULL ON UPDATE CASCADE;
