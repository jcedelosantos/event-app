-- CreateTable
CREATE TABLE "ClubMember" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "carnet" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "lastname" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "tenantId" INTEGER NOT NULL,
    CONSTRAINT "ClubMember_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ClubMember_tenantId_carnet_key" ON "ClubMember"("tenantId", "carnet");
