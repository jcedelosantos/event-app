-- AlterTable
ALTER TABLE "User" ADD COLUMN "scannerEventId" INTEGER;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_scannerEventId_fkey" FOREIGN KEY ("scannerEventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- UserType es una tabla chica y fija (ROOT/USER/CLIENT/SUPERADMIN, ver prisma/seed.ts) que solo se
-- siembra en bases de datos nuevas/vacías — en producción no hay ningún paso que la reseed, así que
-- el nuevo rol SCANNER se inserta acá directamente. license no gatea nada nuevo (el bloqueo real es
-- blockScannerRole en middleware/auth.ts), pero se completa por consistencia con el resto de filas.
INSERT INTO "UserType" ("name", "description", "type", "license")
SELECT 'Escáner', 'Scanner', 'SCANNER', '["SCAN"]'
WHERE NOT EXISTS (SELECT 1 FROM "UserType" WHERE "type" = 'SCANNER');
