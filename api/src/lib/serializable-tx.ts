import { Prisma } from '@prisma/client';
import { prisma } from './prisma';

// Envuelve las transacciones cuya corrección depende de una invariante que ninguna constraint de
// la DB expresa por sí sola (cupo total de un evento, tope de invitados por socio/anfitrión,
// bloqueo de doble registro en eventos vinculados — ver capacity.ts, attendee.ts, host-guest.ts,
// duplicate-event-guard.ts). Hoy esto "funciona" contra SQLite solo porque el motor serializa TODAS
// las transacciones de escritura del archivo por accidente — bajo Postgres (READ COMMITTED por
// default) dos compras concurrentes podrían leer el mismo conteo antes de que ninguna confirme.
// Serializable hace que Postgres detecte ese conflicto y aborte una de las dos con P2034 en vez de
// dejar pasar overselling silencioso; acá se reintenta unas pocas veces antes de rendirse.
//
// Confirmado que Prisma acepta este isolationLevel contra el conector de SQLite sin error (lo
// ignora, ya que SQLite no tiene niveles graduales) — mismo código sirve antes y después de migrar
// el motor de base de datos.
const MAX_RETRIES = 4;
const RETRY_DELAY_MS = 50;

function isSerializationConflict(err: unknown): boolean {
	return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2034';
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

// `any` a propósito, no Prisma.TransactionClient — el `tx` real que Prisma pasa acá viene del
// cliente extendido (tenant-guard, ver lib/prisma.ts) y su tipo generado no encaja limpio con
// Prisma.TransactionClient (mismo motivo documentado en capacity.ts/attendee.ts/host-guest.ts).
// Cada caller sigue tipando `tx` en su propia firma con el structural type mínimo que necesita.
export async function serializableTransaction<T>(fn: (tx: any) => Promise<T>): Promise<T> {
	for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
		try {
			return await prisma.$transaction(fn, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
		} catch (err) {
			if (isSerializationConflict(err) && attempt < MAX_RETRIES) {
				await sleep(RETRY_DELAY_MS * attempt);
				continue;
			}
			throw err;
		}
	}
	// Inalcanzable — el loop siempre retorna o relanza en la última vuelta — pero TS no lo sabe.
	throw new Error('serializableTransaction: reintentos agotados');
}
