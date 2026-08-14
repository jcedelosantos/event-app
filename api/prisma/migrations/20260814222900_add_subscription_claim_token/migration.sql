-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN "claimTokenHash" TEXT;
ALTER TABLE "Subscription" ADD COLUMN "claimTokenExpiresAt" TIMESTAMP(3);
