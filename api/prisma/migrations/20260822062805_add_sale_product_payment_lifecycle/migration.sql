-- AlterTable
ALTER TABLE "SaleProduct" ADD COLUMN     "channel" TEXT NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "holdToken" TEXT,
ADD COLUMN     "paymentExpiresAt" TIMESTAMP(3),
ADD COLUMN     "paymentProvider" TEXT,
ADD COLUMN     "paymentReceiptUrl" TEXT,
ADD COLUMN     "paymentStatus" TEXT NOT NULL DEFAULT 'PAID',
ADD COLUMN     "paypalOrderId" TEXT;
