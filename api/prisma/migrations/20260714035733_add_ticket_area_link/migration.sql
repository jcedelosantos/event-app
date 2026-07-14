-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
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
    CONSTRAINT "Ticket_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Ticket_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "Area" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Ticket" ("active", "code", "count", "description", "eventId", "id", "img", "name", "price", "type") SELECT "active", "code", "count", "description", "eventId", "id", "img", "name", "price", "type" FROM "Ticket";
DROP TABLE "Ticket";
ALTER TABLE "new_Ticket" RENAME TO "Ticket";
CREATE UNIQUE INDEX "Ticket_code_key" ON "Ticket"("code");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
