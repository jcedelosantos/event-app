-- Drop unused Product/Catalog/Stock hierarchy (never had rows) and recreate Product linked
-- directly to Event, mirroring Ticket.
DROP TABLE IF EXISTS "Product";
DROP TABLE IF EXISTS "Catalog";
DROP TABLE IF EXISTS "Stock";

CREATE TABLE "Product" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "code" TEXT NOT NULL,
    "img" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "price" REAL NOT NULL,
    "eventId" INTEGER NOT NULL,
    CONSTRAINT "Product_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "Product_code_key" ON "Product"("code");
