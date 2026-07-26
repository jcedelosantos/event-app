import { randomUUID } from 'node:crypto';

// Estructural en vez de tipado contra un cliente Prisma concreto — ver unique-username.ts, mismo
// motivo (tenant-guard vía $extends no encaja limpio con los tipos base de Prisma).
type ChildLookupClient = {
	child: { findFirst: (args: { where: { parentId: number; eventId: number; tenantId: number }; select: { codeQR: true } }) => Promise<{ codeQR: string } | null> };
};

// Todos los hijos del mismo padre/madre para el mismo evento comparten el mismo codeQR ("talón
// familiar") — un solo escaneo en la puerta de comida entrega la comida de todos los hermanos a la
// vez, en vez de que el staff tenga que escanear uno por uno (ver scan.ts). Si ya existe al menos
// un hijo registrado para esa combinación padre+evento, se reutiliza su código; si es el primero,
// se genera uno nuevo.
export async function resolveFamilyCodeQR(client: ChildLookupClient, params: { parentId: number; eventId: number; tenantId: number }): Promise<string> {
	const existing = await client.child.findFirst({
		where: { parentId: params.parentId, eventId: params.eventId, tenantId: params.tenantId },
		select: { codeQR: true },
	});
	return existing?.codeQR ?? randomUUID();
}
