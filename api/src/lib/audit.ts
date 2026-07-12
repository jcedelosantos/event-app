import { prisma } from './prisma';

type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE';

// Nunca debe tumbar la operación principal (crear/borrar el registro real) por un fallo al
// escribir el log — la auditoría es secundaria a que la acción de negocio se complete.
export async function logAudit(params: { userId: number | null; action: AuditAction; entity: string; entityId: number; summary: string }) {
	try {
		await prisma.auditLog.create({ data: params });
	} catch (err) {
		console.error('No se pudo registrar auditoría:', err);
	}
}
