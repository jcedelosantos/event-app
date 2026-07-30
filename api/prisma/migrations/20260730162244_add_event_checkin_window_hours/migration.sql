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
    "checkInWindowHours" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "Event_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Event_mapId_fkey" FOREIGN KEY ("mapId") REFERENCES "Map" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Event_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Event" ("active", "code", "createdAt", "dateOff", "dateOn", "dateSale", "description", "duplicateGroupKey", "hostName", "id", "img", "mapId", "maxHostGuests", "name", "paymentMode", "startTime", "tenantId", "type", "updatedAt", "userId") SELECT "active", "code", "createdAt", "dateOff", "dateOn", "dateSale", "description", "duplicateGroupKey", "hostName", "id", "img", "mapId", "maxHostGuests", "name", "paymentMode", "startTime", "tenantId", "type", "updatedAt", "userId" FROM "Event";
DROP TABLE "Event";
ALTER TABLE "new_Event" RENAME TO "Event";
CREATE UNIQUE INDEX "Event_code_key" ON "Event"("code");
CREATE INDEX "Event_tenantId_duplicateGroupKey_idx" ON "Event"("tenantId", "duplicateGroupKey");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
