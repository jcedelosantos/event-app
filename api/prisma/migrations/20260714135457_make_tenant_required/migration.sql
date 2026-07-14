/*
  Warnings:

  - The primary key for the `AppSetting` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - Added the required column `tenantId` to the `AppSetting` table without a default value. This is not possible if the table is not empty.
  - Made the column `tenantId` on table `Area` required. This step will fail if there are existing NULL values in that column.
  - Made the column `tenantId` on table `AuditLog` required. This step will fail if there are existing NULL values in that column.
  - Made the column `tenantId` on table `Event` required. This step will fail if there are existing NULL values in that column.
  - Made the column `tenantId` on table `Map` required. This step will fail if there are existing NULL values in that column.
  - Made the column `tenantId` on table `Product` required. This step will fail if there are existing NULL values in that column.
  - Made the column `tenantId` on table `SaleProduct` required. This step will fail if there are existing NULL values in that column.
  - Made the column `tenantId` on table `SaleTicket` required. This step will fail if there are existing NULL values in that column.
  - Made the column `tenantId` on table `Seat` required. This step will fail if there are existing NULL values in that column.
  - Made the column `tenantId` on table `Table` required. This step will fail if there are existing NULL values in that column.
  - Made the column `tenantId` on table `Ticket` required. This step will fail if there are existing NULL values in that column.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AppSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "tenantId" INTEGER NOT NULL,

    PRIMARY KEY ("tenantId", "key"),
    CONSTRAINT "AppSetting_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_AppSetting" ("key", "value") SELECT "key", "value" FROM "AppSetting";
DROP TABLE "AppSetting";
ALTER TABLE "new_AppSetting" RENAME TO "AppSetting";
CREATE TABLE "new_Area" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "img" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "x" REAL NOT NULL,
    "y" REAL NOT NULL,
    "radio" REAL NOT NULL,
    "color" TEXT NOT NULL,
    "size" REAL NOT NULL,
    "backGround" TEXT NOT NULL,
    "totalTables" INTEGER NOT NULL DEFAULT 0,
    "totalSeats" INTEGER NOT NULL DEFAULT 0,
    "totalCount" INTEGER NOT NULL DEFAULT 0,
    "mapId" INTEGER NOT NULL,
    "tenantId" INTEGER NOT NULL,
    CONSTRAINT "Area_mapId_fkey" FOREIGN KEY ("mapId") REFERENCES "Map" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Area_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Area" ("backGround", "color", "description", "icon", "id", "img", "mapId", "name", "radio", "size", "tenantId", "totalCount", "totalSeats", "totalTables", "type", "x", "y") SELECT "backGround", "color", "description", "icon", "id", "img", "mapId", "name", "radio", "size", "tenantId", "totalCount", "totalSeats", "totalTables", "type", "x", "y" FROM "Area";
DROP TABLE "Area";
ALTER TABLE "new_Area" RENAME TO "Area";
CREATE TABLE "new_AuditLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" INTEGER NOT NULL,
    "summary" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId" INTEGER NOT NULL,
    CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AuditLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_AuditLog" ("action", "createdAt", "entity", "entityId", "id", "summary", "tenantId", "userId") SELECT "action", "createdAt", "entity", "entityId", "id", "summary", "tenantId", "userId" FROM "AuditLog";
DROP TABLE "AuditLog";
ALTER TABLE "new_AuditLog" RENAME TO "AuditLog";
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
    CONSTRAINT "Event_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Event_mapId_fkey" FOREIGN KEY ("mapId") REFERENCES "Map" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Event_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Event" ("active", "code", "createdAt", "dateOff", "dateOn", "dateSale", "description", "id", "img", "mapId", "name", "startTime", "tenantId", "type", "updatedAt", "userId") SELECT "active", "code", "createdAt", "dateOff", "dateOn", "dateSale", "description", "id", "img", "mapId", "name", "startTime", "tenantId", "type", "updatedAt", "userId" FROM "Event";
DROP TABLE "Event";
ALTER TABLE "new_Event" RENAME TO "Event";
CREATE UNIQUE INDEX "Event_code_key" ON "Event"("code");
CREATE TABLE "new_Map" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "img" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "x" REAL NOT NULL,
    "y" REAL NOT NULL,
    "radio" REAL NOT NULL,
    "color" TEXT NOT NULL,
    "size" REAL NOT NULL,
    "backGround" TEXT NOT NULL,
    "totalTables" INTEGER NOT NULL DEFAULT 0,
    "totalTablesSeat" INTEGER NOT NULL DEFAULT 0,
    "totalSeats" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "tenantId" INTEGER NOT NULL,
    CONSTRAINT "Map_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Map" ("backGround", "color", "createdAt", "description", "id", "img", "name", "radio", "size", "tenantId", "totalSeats", "totalTables", "totalTablesSeat", "type", "updatedAt", "x", "y") SELECT "backGround", "color", "createdAt", "description", "id", "img", "name", "radio", "size", "tenantId", "totalSeats", "totalTables", "totalTablesSeat", "type", "updatedAt", "x", "y" FROM "Map";
DROP TABLE "Map";
ALTER TABLE "new_Map" RENAME TO "Map";
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
    CONSTRAINT "Product_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Product_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Product" ("active", "code", "count", "description", "eventId", "id", "img", "name", "price", "tenantId", "type", "variant") SELECT "active", "code", "count", "description", "eventId", "id", "img", "name", "price", "tenantId", "type", "variant" FROM "Product";
DROP TABLE "Product";
ALTER TABLE "new_Product" RENAME TO "Product";
CREATE UNIQUE INDEX "Product_code_key" ON "Product"("code");
CREATE TABLE "new_SaleProduct" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "description" TEXT NOT NULL DEFAULT '',
    "dateSold" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidType" TEXT NOT NULL,
    "codeQR" TEXT NOT NULL,
    "deliveredAt" DATETIME,
    "eventId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "clientId" INTEGER NOT NULL,
    "tenantId" INTEGER NOT NULL,
    CONSTRAINT "SaleProduct_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SaleProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SaleProduct_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SaleProduct_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SaleProduct_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_SaleProduct" ("clientId", "codeQR", "dateSold", "deliveredAt", "description", "eventId", "id", "paidType", "productId", "quantity", "tenantId", "userId") SELECT "clientId", "codeQR", "dateSold", "deliveredAt", "description", "eventId", "id", "paidType", "productId", "quantity", "tenantId", "userId" FROM "SaleProduct";
DROP TABLE "SaleProduct";
ALTER TABLE "new_SaleProduct" RENAME TO "SaleProduct";
CREATE UNIQUE INDEX "SaleProduct_codeQR_key" ON "SaleProduct"("codeQR");
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
    CONSTRAINT "SaleTicket_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SaleTicket_seatId_fkey" FOREIGN KEY ("seatId") REFERENCES "Seat" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SaleTicket_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SaleTicket_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SaleTicket_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SaleTicket_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_SaleTicket" ("active", "checkedInAt", "clientId", "codeQR", "dateSold", "description", "eventId", "id", "paidType", "seatId", "status", "tenantId", "ticketId", "userId") SELECT "active", "checkedInAt", "clientId", "codeQR", "dateSold", "description", "eventId", "id", "paidType", "seatId", "status", "tenantId", "ticketId", "userId" FROM "SaleTicket";
DROP TABLE "SaleTicket";
ALTER TABLE "new_SaleTicket" RENAME TO "SaleTicket";
CREATE UNIQUE INDEX "SaleTicket_codeQR_key" ON "SaleTicket"("codeQR");
CREATE UNIQUE INDEX "SaleTicket_eventId_seatId_key" ON "SaleTicket"("eventId", "seatId");
CREATE TABLE "new_Seat" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "x" REAL NOT NULL,
    "y" REAL NOT NULL,
    "radio" REAL NOT NULL,
    "color" TEXT NOT NULL,
    "size" REAL NOT NULL,
    "areaId" INTEGER NOT NULL,
    "tableId" INTEGER,
    "tenantId" INTEGER NOT NULL,
    CONSTRAINT "Seat_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "Area" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Seat_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "Table" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Seat_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Seat" ("areaId", "color", "icon", "id", "name", "radio", "size", "tableId", "tenantId", "type", "x", "y") SELECT "areaId", "color", "icon", "id", "name", "radio", "size", "tableId", "tenantId", "type", "x", "y" FROM "Seat";
DROP TABLE "Seat";
ALTER TABLE "new_Seat" RENAME TO "Seat";
CREATE TABLE "new_Table" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "x" REAL NOT NULL,
    "y" REAL NOT NULL,
    "radio" REAL NOT NULL,
    "color" TEXT NOT NULL,
    "size" REAL NOT NULL,
    "areaId" INTEGER NOT NULL,
    "tenantId" INTEGER NOT NULL,
    CONSTRAINT "Table_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "Area" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Table_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Table" ("areaId", "color", "icon", "id", "name", "radio", "size", "tenantId", "type", "x", "y") SELECT "areaId", "color", "icon", "id", "name", "radio", "size", "tenantId", "type", "x", "y" FROM "Table";
DROP TABLE "Table";
ALTER TABLE "new_Table" RENAME TO "Table";
CREATE TABLE "new_Ticket" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "img" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "price" REAL NOT NULL,
    "eventId" INTEGER NOT NULL,
    "areaId" INTEGER,
    "tenantId" INTEGER NOT NULL,
    CONSTRAINT "Ticket_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Ticket_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "Area" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Ticket_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Ticket" ("active", "areaId", "code", "count", "description", "eventId", "id", "img", "name", "price", "tenantId", "type") SELECT "active", "areaId", "code", "count", "description", "eventId", "id", "img", "name", "price", "tenantId", "type" FROM "Ticket";
DROP TABLE "Ticket";
ALTER TABLE "new_Ticket" RENAME TO "Ticket";
CREATE UNIQUE INDEX "Ticket_code_key" ON "Ticket"("code");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
