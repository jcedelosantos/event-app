FROM node:22-slim

# openssl: sin esto el motor de Prisma no puede detectar la versión real de libssl y cae a un
# default (openssl-1.1.x) que puede no coincidir con el runtime — funciona por ahora de casualidad,
# pero es la clase de deuda que rompe en el próximo bump de Node/Prisma.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
	&& rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . .

RUN npm ci
RUN npm run build

WORKDIR /app/api
RUN npm ci
RUN npx prisma generate
RUN npm run build

EXPOSE 3001
CMD npx prisma migrate deploy && npx tsx prisma/seed.ts && node dist/server.js
