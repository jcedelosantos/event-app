-- Clasifica los tickets de tenants CLUB ya existentes por nombre, para que el picker público
-- pueda auto-seleccionar el ticket correcto sin que el admin tenga que volver a configurarlos.
UPDATE "Ticket"
SET "attendeeType" = 'SOCIO'
WHERE "attendeeType" IS NULL AND UPPER("name") LIKE '%SOCIO%';

UPDATE "Ticket"
SET "attendeeType" = 'INVITADO'
WHERE "attendeeType" IS NULL AND UPPER("name") LIKE '%INVITADO%';
