-- Migra todos los campos monetarios de Float (dólares) a Int (centavos) — ver api/src/lib/money.ts
-- para el porqué. ROUND(x * 100)::integer es una conversión sin pérdida real: la plata ya vivía en
-- dólares con como mucho 2 decimales, así que no hay fracción de centavo genuina que perder.

-- Subscription.pendingOverageUSD -> pendingOverageCents (campo sin lectores/escritores reales, se
-- migra igual por consistencia del schema).
ALTER TABLE "Subscription" ADD COLUMN "pendingOverageCents" INTEGER NOT NULL DEFAULT 0;
UPDATE "Subscription" SET "pendingOverageCents" = ROUND("pendingOverageUSD" * 100)::integer;
ALTER TABLE "Subscription" DROP COLUMN "pendingOverageUSD";

-- Invoice.planPriceUSD/overageUSD/totalUSD -> planPriceCents/overageCents/totalCents
ALTER TABLE "Invoice" ADD COLUMN "planPriceCents" INTEGER;
UPDATE "Invoice" SET "planPriceCents" = ROUND("planPriceUSD" * 100)::integer;
ALTER TABLE "Invoice" ALTER COLUMN "planPriceCents" SET NOT NULL;
ALTER TABLE "Invoice" DROP COLUMN "planPriceUSD";

ALTER TABLE "Invoice" ADD COLUMN "overageCents" INTEGER NOT NULL DEFAULT 0;
UPDATE "Invoice" SET "overageCents" = ROUND("overageUSD" * 100)::integer;
ALTER TABLE "Invoice" DROP COLUMN "overageUSD";

ALTER TABLE "Invoice" ADD COLUMN "totalCents" INTEGER;
UPDATE "Invoice" SET "totalCents" = ROUND("totalUSD" * 100)::integer;
ALTER TABLE "Invoice" ALTER COLUMN "totalCents" SET NOT NULL;
ALTER TABLE "Invoice" DROP COLUMN "totalUSD";

-- Ticket.price -> priceCents
ALTER TABLE "Ticket" ADD COLUMN "priceCents" INTEGER;
UPDATE "Ticket" SET "priceCents" = ROUND("price" * 100)::integer;
ALTER TABLE "Ticket" ALTER COLUMN "priceCents" SET NOT NULL;
ALTER TABLE "Ticket" DROP COLUMN "price";

-- Product.price -> priceCents
ALTER TABLE "Product" ADD COLUMN "priceCents" INTEGER;
UPDATE "Product" SET "priceCents" = ROUND("price" * 100)::integer;
ALTER TABLE "Product" ALTER COLUMN "priceCents" SET NOT NULL;
ALTER TABLE "Product" DROP COLUMN "price";

-- SaleProduct.unitPriceUSD -> unitPriceCents (nullable, solo backfillear filas no-null)
ALTER TABLE "SaleProduct" ADD COLUMN "unitPriceCents" INTEGER;
UPDATE "SaleProduct" SET "unitPriceCents" = ROUND("unitPriceUSD" * 100)::integer WHERE "unitPriceUSD" IS NOT NULL;
ALTER TABLE "SaleProduct" DROP COLUMN "unitPriceUSD";

-- SaleTicket.priceUSD -> priceCents (nullable, solo backfillear filas no-null)
ALTER TABLE "SaleTicket" ADD COLUMN "priceCents" INTEGER;
UPDATE "SaleTicket" SET "priceCents" = ROUND("priceUSD" * 100)::integer WHERE "priceUSD" IS NOT NULL;
ALTER TABLE "SaleTicket" DROP COLUMN "priceUSD";
