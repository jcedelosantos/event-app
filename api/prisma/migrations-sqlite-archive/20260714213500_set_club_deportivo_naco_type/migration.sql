-- Data migration: el único tenant real hoy (Club Deportivo Naco) es, literalmente, un club — se
-- marca como tal para que la regla de socio/invitado (ver SaleTicket.attendeeType) aplique desde
-- ya, sin depender de que alguien lo configure a mano desde el panel de Super Admin después del
-- deploy. Cualquier tenant nuevo arranca en GENERAL por default y se puede cambiar a CLUB o CHURCH
-- desde ahí cuando corresponda.
UPDATE "Tenant" SET "type" = 'CLUB' WHERE "slug" = 'club-deportivo-naco' AND "type" = 'GENERAL';
