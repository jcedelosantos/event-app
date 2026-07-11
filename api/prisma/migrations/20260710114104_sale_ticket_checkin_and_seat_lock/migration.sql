-- AlterTable
ALTER TABLE "SaleTicket" ADD COLUMN "checkedInAt" DATETIME;

-- CreateIndex
CREATE UNIQUE INDEX "SaleTicket_codeQR_key" ON "SaleTicket"("codeQR");

-- CreateIndex
CREATE UNIQUE INDEX "SaleTicket_eventId_seatId_key" ON "SaleTicket"("eventId", "seatId");
