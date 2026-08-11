-- CreateTable
CREATE TABLE "EnterpriseLead" (
    "id" SERIAL NOT NULL,
    "orgName" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL DEFAULT '',
    "message" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "contactedAt" TIMESTAMP(3),

    CONSTRAINT "EnterpriseLead_pkey" PRIMARY KEY ("id")
);
