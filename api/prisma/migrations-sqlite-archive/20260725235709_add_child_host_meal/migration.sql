-- AlterTable
ALTER TABLE "Event" ADD COLUMN "hostName" TEXT;
ALTER TABLE "Event" ADD COLUMN "maxHostGuests" INTEGER;

-- CreateTable
CREATE TABLE "Child" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "age" INTEGER,
    "codeQR" TEXT NOT NULL,
    "checkedInAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eventId" INTEGER NOT NULL,
    "parentId" INTEGER NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "saleProductId" INTEGER,
    CONSTRAINT "Child_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Child_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Child_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Child_saleProductId_fkey" FOREIGN KEY ("saleProductId") REFERENCES "SaleProduct" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Product" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "code" TEXT NOT NULL,
    "img" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "variant" TEXT NOT NULL DEFAULT '',
    "count" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "price" REAL NOT NULL,
    "eventId" INTEGER NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "isMealOfTheDay" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "Product_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Product_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Product" ("active", "code", "count", "description", "eventId", "id", "img", "name", "price", "tenantId", "type", "variant") SELECT "active", "code", "count", "description", "eventId", "id", "img", "name", "price", "tenantId", "type", "variant" FROM "Product";
DROP TABLE "Product";
ALTER TABLE "new_Product" RENAME TO "Product";
CREATE UNIQUE INDEX "Product_code_key" ON "Product"("code");
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
    CONSTRAINT "SaleTicket_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SaleTicket_seatId_fkey" FOREIGN KEY ("seatId") REFERENCES "Seat" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SaleTicket_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SaleTicket_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SaleTicket_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SaleTicket_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_SaleTicket" ("active", "attendeeType", "checkedInAt", "clientId", "codeQR", "dateSold", "description", "eventId", "id", "paidType", "seatId", "sponsorCarnet", "status", "tenantId", "ticketId", "userId") SELECT "active", "attendeeType", "checkedInAt", "clientId", "codeQR", "dateSold", "description", "eventId", "id", "paidType", "seatId", "sponsorCarnet", "status", "tenantId", "ticketId", "userId" FROM "SaleTicket";
DROP TABLE "SaleTicket";
ALTER TABLE "new_SaleTicket" RENAME TO "SaleTicket";
CREATE UNIQUE INDEX "SaleTicket_codeQR_key" ON "SaleTicket"("codeQR");
CREATE UNIQUE INDEX "SaleTicket_eventId_seatId_key" ON "SaleTicket"("eventId", "seatId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Child_codeQR_key" ON "Child"("codeQR");

-- CreateIndex
CREATE UNIQUE INDEX "Child_saleProductId_key" ON "Child"("saleProductId");
