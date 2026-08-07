import { PrismaClient } from '@prisma/client';
import { tenantGuardExtension } from './tenant-guard';

const basePrisma = new PrismaClient();

// WAL en vez del rollback journal por default: con rollback journal, cualquier escritura bloquea
// también a los lectores durante toda la transacción — con muchos tenants activos a la vez eso
// significa que un club vendiendo tickets puede trabar el dashboard de otro club sin relación
// alguna. WAL permite lectores concurrentes mientras hay una escritura en curso. Se fija una sola
// vez por archivo (queda en el header del .db), correrlo en cada boot es idempotente y barato.
// $queryRawUnsafe (no $executeRawUnsafe) para AMBAS: tanto "PRAGMA journal_mode=WAL" como
// "PRAGMA busy_timeout=N" devuelven una fila con el valor resultante — Prisma rechaza con P2010
// ("Execute returned results") si se mandan por el canal de execute en vez del de query, error
// real encontrado al probar esto contra el .db local.
// busy_timeout: sin esto, dos escrituras que sí compiten entre sí (mismo tenant, mismo evento)
// fallan al instante con "database is locked" en vez de esperar su turno — con esto, SQLite
// reintenta internamente hasta 5s antes de tirar el error.
basePrisma
	.$queryRawUnsafe('PRAGMA journal_mode=WAL;')
	.then(() => basePrisma.$queryRawUnsafe('PRAGMA busy_timeout=5000;'))
	.catch((err) => console.error('No se pudo configurar WAL/busy_timeout en SQLite:', err));

// Escape hatch deliberado y explícito para el único caso legítimo de lookup sin tenantId: resolver
// un Event por su `code` público (único globalmente, ver public.ts) antes de conocer a qué tenant
// pertenece. No usar esto para nada más — cualquier otra query debe pasar por `prisma` (con el
// tenant-guard) para no arriesgar una fuga de datos entre organizaciones.
export const prismaUnscoped = basePrisma;

export const prisma = basePrisma.$extends(tenantGuardExtension());
