-- CreateTable
CREATE TABLE "WaitingRoomEntry" (
    "id" SERIAL NOT NULL,
    "eventCode" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "admittedAt" TIMESTAMP(3),

    CONSTRAINT "WaitingRoomEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WaitingRoomEntry_eventCode_sessionId_key" ON "WaitingRoomEntry"("eventCode", "sessionId");

-- CreateIndex
CREATE INDEX "WaitingRoomEntry_eventCode_status_joinedAt_idx" ON "WaitingRoomEntry"("eventCode", "status", "joinedAt");
