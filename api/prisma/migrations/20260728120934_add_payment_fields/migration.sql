-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Event" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "img" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "dateSale" DATETIME NOT NULL,
    "dateOn" DATETIME NOT NULL,
    "dateOff" DATETIME NOT NULL,
    "startTime" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "userId" INTEGER NOT NULL,
    "mapId" INTEGER,
    "tenantId" INTEGER NOT NULL,
    "hostName" TEXT,
    "maxHostGuests" INTEGER,
    "duplicateGroupKey" TEXT,
    "paymentMode" TEXT NOT NULL DEFAULT 'NONE',
    CONSTRAINT "Event_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Event_mapId_fkey" FOREIGN KEY ("mapId") REFERENCES "Map" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Event_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Event" ("active", "code", "createdAt", "dateOff", "dateOn", "dateSale", "description", "duplicateGroupKey", "hostName", "id", "img", "mapId", "maxHostGuests", "name", "startTime", "tenantId", "type", "updatedAt", "userId") SELECT "active", "code", "createdAt", "dateOff", "dateOn", "dateSale", "description", "duplicateGroupKey", "hostName", "id", "img", "mapId", "maxHostGuests", "name", "startTime", "tenantId", "type", "updatedAt", "userId" FROM "Event";
DROP TABLE "Event";
ALTER TABLE "new_Event" RENAME TO "Event";
CREATE UNIQUE INDEX "Event_code_key" ON "Event"("code");
CREATE INDEX "Event_tenantId_duplicateGroupKey_idx" ON "Event"("tenantId", "duplicateGroupKey");
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
INSERT INTO "new_SaleTicket" ("active", "attendeeType", "checkedInAt", "clientId", "codeQR", "dateSold", "description", "eventId", "id", "isHostGuest", "paidType", "seatId", "sponsorCarnet", "status", "tenantId", "ticketId", "userId") SELECT "active", "attendeeType", "checkedInAt", "clientId", "codeQR", "dateSold", "description", "eventId", "id", "isHostGuest", "paidType", "seatId", "sponsorCarnet", "status", "tenantId", "ticketId", "userId" FROM "SaleTicket";
DROP TABLE "SaleTicket";
ALTER TABLE "new_SaleTicket" RENAME TO "SaleTicket";
CREATE UNIQUE INDEX "SaleTicket_codeQR_key" ON "SaleTicket"("codeQR");
CREATE UNIQUE INDEX "SaleTicket_eventId_seatId_key" ON "SaleTicket"("eventId", "seatId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
