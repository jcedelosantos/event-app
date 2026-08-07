FROM node:22-slim

# Litestream replica el WAL de /data/dev.db casi en continuo hacia el bucket S3-compatible de
# Railway (ver litestream.yml) — sin esto, un volumen corrompido o borrado por error se lleva los
# datos de TODOS los tenants sin ningún punto de restauración.
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates \
	&& curl -fsSL https://github.com/benbjohnson/litestream/releases/download/v0.5.16/litestream-0.5.16-linux-x86_64.tar.gz | tar -xz -C /usr/local/bin litestream \
	&& apt-get purge -y curl && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . .

RUN npm ci
RUN npm run build

WORKDIR /app/api
RUN npm ci
RUN npx prisma generate
RUN npm run build

EXPOSE 3001
# restore corre primero y es un no-op si /data/dev.db ya existe (deploys normales) o si el bucket
# todavía no tiene ninguna réplica (primer deploy de la vida de la app) — solo actúa cuando hace
# falta reponer un volumen nuevo/vacío a partir del último backup.
CMD litestream restore -if-db-not-exists -if-replica-exists -config /app/litestream.yml /data/dev.db && \
	litestream replicate -config /app/litestream.yml -exec "sh -c 'npx prisma migrate deploy && npx tsx prisma/seed.ts && node dist/server.js'"
