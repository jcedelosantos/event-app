-- Data migration (no schema changes): crea el tenant inicial para los datos ya existentes y
-- reasigna todo lo que quedó con tenantId NULL tras la migración anterior. Corre ANTES de
-- make_tenant_required, que exige tenantId NOT NULL en estas tablas y fallaría si quedara algún
-- NULL sin backfillear. Cada paso está guardado con WHERE NOT EXISTS / IS NULL para que sea seguro
-- volver a aplicarlo sin duplicar datos si alguna vez corre dos veces.

INSERT INTO "Tenant" ("name", "slug", "active", "createdAt")
SELECT 'Club Deportivo Naco', 'club-deportivo-naco', 1, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "Tenant" WHERE "slug" = 'club-deportivo-naco');

UPDATE "Area" SET "tenantId" = (SELECT "id" FROM "Tenant" WHERE "slug" = 'club-deportivo-naco') WHERE "tenantId" IS NULL;
UPDATE "AuditLog" SET "tenantId" = (SELECT "id" FROM "Tenant" WHERE "slug" = 'club-deportivo-naco') WHERE "tenantId" IS NULL;
UPDATE "Event" SET "tenantId" = (SELECT "id" FROM "Tenant" WHERE "slug" = 'club-deportivo-naco') WHERE "tenantId" IS NULL;
UPDATE "Map" SET "tenantId" = (SELECT "id" FROM "Tenant" WHERE "slug" = 'club-deportivo-naco') WHERE "tenantId" IS NULL;
UPDATE "Product" SET "tenantId" = (SELECT "id" FROM "Tenant" WHERE "slug" = 'club-deportivo-naco') WHERE "tenantId" IS NULL;
UPDATE "SaleProduct" SET "tenantId" = (SELECT "id" FROM "Tenant" WHERE "slug" = 'club-deportivo-naco') WHERE "tenantId" IS NULL;
UPDATE "SaleTicket" SET "tenantId" = (SELECT "id" FROM "Tenant" WHERE "slug" = 'club-deportivo-naco') WHERE "tenantId" IS NULL;
UPDATE "Seat" SET "tenantId" = (SELECT "id" FROM "Tenant" WHERE "slug" = 'club-deportivo-naco') WHERE "tenantId" IS NULL;
UPDATE "Table" SET "tenantId" = (SELECT "id" FROM "Tenant" WHERE "slug" = 'club-deportivo-naco') WHERE "tenantId" IS NULL;
UPDATE "Ticket" SET "tenantId" = (SELECT "id" FROM "Tenant" WHERE "slug" = 'club-deportivo-naco') WHERE "tenantId" IS NULL;
UPDATE "User" SET "tenantId" = (SELECT "id" FROM "Tenant" WHERE "slug" = 'club-deportivo-naco') WHERE "tenantId" IS NULL;

-- AppSetting todavía no tiene columna tenantId en este punto (la agrega recién make_tenant_required
-- junto con el cambio de PK) — no hay forma de backfillearla acá, así que se limpia (son solo
-- valores de branding, ej. color de acento; se re-crean solos la próxima vez que alguien los guarde
-- desde Settings) para que el rebuild de tabla de la siguiente migración no falle.
DELETE FROM "AppSetting";

INSERT INTO "UserType" ("name", "description", "type", "license")
SELECT 'Super Admin', 'Administrador de la plataforma (todos los tenants)', 'SUPERADMIN', '["*"]'
WHERE NOT EXISTS (SELECT 1 FROM "UserType" WHERE "type" = 'SUPERADMIN');

-- tenantId se deja NULL a propósito: es la única cuenta del sistema que no pertenece a ningún
-- cliente (ver User.tenantId en schema.prisma). La contraseña de abajo es un hash bcrypt de una
-- contraseña aleatoria generada una sola vez para este deploy — no es un valor por defecto ni
-- reutilizado en ningún otro lado.
INSERT INTO "User" ("username", "password", "name", "lastname", "gender", "email", "carnet", "adress", "phone", "typeId", "createdAt", "updatedAt", "tenantId")
SELECT 'superadmin', '$2a$10$YdRItbUSYyU7zuklB1actupCiiNYOKgNlN28XM5qRAiEqP4bsVyGu', 'Super', 'Admin', '', 'superadmin@seatapp.local', '', '', '', (SELECT "id" FROM "UserType" WHERE "type" = 'SUPERADMIN'), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL
WHERE NOT EXISTS (SELECT 1 FROM "User" WHERE "username" = 'superadmin');
