FROM node:22-slim

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
