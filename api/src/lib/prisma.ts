import { PrismaClient } from '@prisma/client';
import { tenantGuardExtension } from './tenant-guard';

const basePrisma = new PrismaClient();

// Escape hatch deliberado y explícito para el único caso legítimo de lookup sin tenantId: resolver
// un Event por su `code` público (único globalmente, ver public.ts) antes de conocer a qué tenant
// pertenece. No usar esto para nada más — cualquier otra query debe pasar por `prisma` (con el
// tenant-guard) para no arriesgar una fuga de datos entre organizaciones.
export const prismaUnscoped = basePrisma;

export const prisma = basePrisma.$extends(tenantGuardExtension());
