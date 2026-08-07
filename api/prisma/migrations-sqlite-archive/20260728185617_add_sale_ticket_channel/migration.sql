-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_SaleTicket" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "status" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT NOT NULL,
    "dateSold" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidType" TEXT NOT NULL,
    "codeQR" TEXT NOT NULL,
    "checkedInAt" DATETIME,
    "eventId" INTEGER NOT NULL,
    "seatId" INTEGER NOT NULL,
    "ticketId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "clientId" INTEGER NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "attendeeType" TEXT NOT NULL DEFAULT 'SOCIO',
    "sponsorCarnet" TEXT,
    "isHostGuest" BOOLEAN NOT NULL DEFAULT false,
    "channel" TEXT NOT NULL DEFAULT 'MANUAL',
    "paymentStatus" TEXT NOT NULL DEFAULT 'PAID',
    "paymentProvider" TEXT,
    "paypalOrderId" TEXT,
    "paymentExpiresAt" DATETIME,
    CONSTRAINT "SaleTicket_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SaleTicket_seatId_fkey" FOREIGN KEY ("seatId") REFERENCES "Seat" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SaleTicket_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SaleTicket_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SaleTicket_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SaleTicket_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_SaleTicket" ("active", "attendeeType", "checkedInAt", "clientId", "codeQR", "dateSold", "description", "eventId", "id", "isHostGuest", "paidType", "paymentExpiresAt", "paymentProvider", "paymentStatus", "paypalOrderId", "seatId", "sponsorCarnet", "status", "tenantId", "ticketId", "userId") SELECT "active", "attendeeType", "checkedInAt", "clientId", "codeQR", "dateSold", "description", "eventId", "id", "isHostGuest", "paidType", "paymentExpiresAt", "paymentProvider", "paymentStatus", "paypalOrderId", "seatId", "sponsorCarnet", "status", "tenantId", "ticketId", "userId" FROM "SaleTicket";
DROP TABLE "SaleTicket";
ALTER TABLE "new_SaleTicket" RENAME TO "SaleTicket";
CREATE UNIQUE INDEX "SaleTicket_codeQR_key" ON "SaleTicket"("codeQR");
CREATE UNIQUE INDEX "SaleTicket_eventId_seatId_key" ON "SaleTicket"("eventId", "seatId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
