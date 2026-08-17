-- AlterTable
ALTER TABLE "User" ADD COLUMN "accessPointId" INTEGER;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_accessPointId_fkey" FOREIGN KEY ("accessPointId") REFERENCES "AccessPoint"("id") ON DELETE SET NULL ON UPDATE CASCADE;
