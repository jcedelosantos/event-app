// Estructural en vez de tipado contra PrismaClient/TransactionClient: el cliente real que usan las
// rutas es el resultado de $extends (tenant-guard), cuyo tipo generado no encaja limpio con esos
// tipos base — pero el único método que hace falta acá (user.findUnique por username) sí calza.
type UserLookupClient = { user: { findUnique: (args: { where: { username: string }; select: { id: true } }) => Promise<{ id: number } | null> } };

// username (a diferencia de email) tiene que ser único en TODA la app, no solo por tenant — el
// login resuelve a qué tenant pertenece la cuenta a partir del username, antes de saber el
// tenantId (ver auth.ts). Acá se usa como identificador auto-generado a partir del email de un
// comprador de autoservicio/CSV, que SÍ puede repetirse entre tenants (la misma persona compra en
// más de un club/iglesia) — un choque no debería frenar la compra, así que se agrega un sufijo
// corto hasta encontrar uno libre en vez de dejar reventar el constraint único.
export async function uniqueUsername(client: UserLookupClient, preferred: string): Promise<string> {
	const existing = await client.user.findUnique({ where: { username: preferred }, select: { id: true } });
	if (!existing) return preferred;
	for (let i = 0; i < 5; i++) {
		const candidate = `${preferred}-${Math.random().toString(36).slice(2, 6)}`;
		const taken = await client.user.findUnique({ where: { username: candidate }, select: { id: true } });
		if (!taken) return candidate;
	}
	return `${preferred}-${Date.now()}`;
}
