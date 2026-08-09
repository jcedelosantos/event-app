import { PrismaClient } from '@prisma/client';
import { tenantGuardExtension } from './tenant-guard';

// NOTA (load-testing 2026-08-09, ver load-tests/results/2026-08-09-multi-tenant.md): se probó
// subir connection_limit de Prisma a 20 (default sin configurar es num_cpus*2+1) para el
// escenario multi-tenant, que mostraba p95/p99 más altos que un solo tenant a concurrencia
// similar. Empeoró drásticamente (p95 pasó de ~550ms a ~32s) sin subir la tasa de error — la
// firma típica de estar pidiendo más conexiones de las que el propio Postgres puede otorgar
// (`max_connections`), no de que el pool de la app fuera chico. Revertido hasta poder confirmar
// el `max_connections` real de la instancia antes de volver a tocar esto.
const basePrisma = new PrismaClient();

// Escape hatch deliberado y explícito para el único caso legítimo de lookup sin tenantId: resolver
// un Event por su `code` público (único globalmente, ver public.ts) antes de conocer a qué tenant
// pertenece. No usar esto para nada más — cualquier otra query debe pasar por `prisma` (con el
// tenant-guard) para no arriesgar una fuga de datos entre organizaciones.
export const prismaUnscoped = basePrisma;

export const prisma = basePrisma.$extends(tenantGuardExtension());
