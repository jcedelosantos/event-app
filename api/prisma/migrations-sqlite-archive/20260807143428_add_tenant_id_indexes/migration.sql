-- CreateIndex
CREATE INDEX "Area_tenantId_idx" ON "Area"("tenantId");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_idx" ON "AuditLog"("tenantId");

-- CreateIndex
CREATE INDEX "Child_tenantId_idx" ON "Child"("tenantId");

-- CreateIndex
CREATE INDEX "Map_tenantId_idx" ON "Map"("tenantId");

-- CreateIndex
CREATE INDEX "Product_tenantId_idx" ON "Product"("tenantId");

-- CreateIndex
CREATE INDEX "SaleProduct_tenantId_idx" ON "SaleProduct"("tenantId");

-- CreateIndex
CREATE INDEX "SaleTicket_tenantId_idx" ON "SaleTicket"("tenantId");

-- CreateIndex
CREATE INDEX "Seat_tenantId_idx" ON "Seat"("tenantId");

-- CreateIndex
CREATE INDEX "Table_tenantId_idx" ON "Table"("tenantId");

-- CreateIndex
CREATE INDEX "Ticket_tenantId_idx" ON "Ticket"("tenantId");
