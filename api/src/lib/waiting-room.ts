import { prisma, prismaUnscoped } from './prisma';
import { serializableTransaction } from './serializable-tx';

// Sala de espera virtual, en Postgres (tabla WaitingRoomEntry) — correcta con más de una réplica
// de la app corriendo a la vez, a diferencia del diseño anterior en memoria del proceso (cada
// réplica tenía su propia cola, así que dos réplicas podían admitir el doble del batchSize sin que
// ninguna lo supiera). El único estado que sigue viviendo en memoria por proceso es el caché corto
// de config (`waitingRoomEnabled`/`waitingRoomBatchSize`) — es de solo lectura y read-mostly, así
// que cada réplica cacheándolo por separado no genera ninguna inconsistencia real (peor caso: hasta
// CONFIG_TTL_MS de desfasaje entre réplicas al prender/apagar la sala de espera a mitad de venta).
//
// El sobrecupo de asientos YA está resuelto en otro lado (constraint único eventId+seatId + hold de
// 15 min, ver public.ts) — esto es puramente para no dejar que un pico de tráfico simultáneo tire
// la query pesada de GET /events/:code sobre todos a la vez.

export const DEFAULT_BATCH_SIZE = 50;
// ~1.33x el hold de compra (15 min, ver public.ts) — da margen sin depender de un heartbeat
// continuo del frontend para saber si alguien sigue activo.
const ADMISSION_WINDOW_MS = 20 * 60_000;
// Colchón por throttling de setInterval en pestañas que pasan a background (Chrome puede bajar a
// ~1 poll/min) — sin esto, alguien que cambia de pestaña un rato perdería su lugar en la cola.
const QUEUE_INACTIVE_TIMEOUT_MS = 3 * 60_000;
// Cuánto se cachea `waitingRoomEnabled`/`waitingRoomBatchSize` antes de releer la DB — evita pegarle
// a la DB en cada poll (cada 4s por visitante) sin dejar de reaccionar razonablemente rápido si el
// manager cambia la config a mitad de una venta.
const CONFIG_TTL_MS = 30_000;

type CachedConfig = {
	enabled: boolean;
	batchSize: number;
	tenantName: string | null;
	tenantLogoUrl: string | null;
	eventName: string | null;
	eventImg: string | null;
	cachedAt: number;
};

const configByEventCode = new Map<string, CachedConfig>();

async function getConfig(code: string): Promise<CachedConfig> {
	const now = Date.now();
	const cached = configByEventCode.get(code);
	if (cached && now - cached.cachedAt < CONFIG_TTL_MS) {
		return cached;
	}
	// tenant.name/logoUrl + name/img del propio evento viajan en el mismo query (sin JOIN nuevo, ya
	// se resuelve el Event por code) — el frontend los usa para mostrar el evento al que se está
	// esperando entrar (ver public-event.component.ts) sin tener que esperar a la query pesada de
	// GET /events/:code.
	const event = await prismaUnscoped.event.findUnique({
		where: { code },
		select: {
			name: true,
			img: true,
			waitingRoomEnabled: true,
			waitingRoomBatchSize: true,
			tenant: { select: { name: true, logoUrl: true } },
		},
	});
	const config: CachedConfig = {
		enabled: !!event?.waitingRoomEnabled,
		batchSize: event?.waitingRoomBatchSize ?? DEFAULT_BATCH_SIZE,
		tenantName: event?.tenant?.name ?? null,
		tenantLogoUrl: event?.tenant?.logoUrl ?? null,
		eventName: event?.name ?? null,
		eventImg: event?.img || null,
		cachedAt: now,
	};
	configByEventCode.set(code, config);
	return config;
}

// Única función con lógica real de admisión — corre entera dentro de una transacción Serializable
// (ver serializable-tx.ts) para que dos requests concurrentes por el mismo evento, aunque vengan de
// réplicas distintas, no promuevan más gente de la que permite batchSize. Filtra vencidos por WHERE
// en vez de borrarlos acá (deleteMany en cada poll sería escritura extra sin necesidad) — el borrado
// físico de filas viejas corre aparte, ver cleanupExpiredWaitingRoomEntries().
async function computeAdmission(eventCode: string, sessionId: string, batchSize: number, now: number): Promise<{ admitted: boolean; position: number | null }> {
	return serializableTransaction(async (tx) => {
		const nowDate = new Date(now);
		// Idempotente por sessionId (incluye el caso de pestaña duplicada, que copia el sessionId de
		// sessionStorage): touch de lastSeenAt si ya existe, alta si es la primera vez — nunca
		// degrada un status ADMITTED existente.
		const entry = await tx.waitingRoomEntry.upsert({
			where: { eventCode_sessionId: { eventCode, sessionId } },
			update: { lastSeenAt: nowDate },
			create: { eventCode, sessionId, status: 'QUEUED', joinedAt: nowDate, lastSeenAt: nowDate },
		});
		if (entry.status === 'ADMITTED') {
			return { admitted: true, position: null };
		}

		// Si el manager bajó el batchSize a mitad de venta, NO se expulsa a nadie ya admitido (podrían
		// estar a mitad de un checkout) — simplemente se deja de promover gente nueva hasta que la
		// cantidad de admitidos baje sola por vencimiento de ventana.
		const admittedCount = await tx.waitingRoomEntry.count({
			where: { eventCode, status: 'ADMITTED', admittedAt: { gt: new Date(now - ADMISSION_WINDOW_MS) } },
		});
		const freeSlots = batchSize - admittedCount;
		if (freeSlots > 0) {
			const toPromote = await tx.waitingRoomEntry.findMany({
				where: { eventCode, status: 'QUEUED', lastSeenAt: { gt: new Date(now - QUEUE_INACTIVE_TIMEOUT_MS) } },
				orderBy: [{ joinedAt: 'asc' }, { id: 'asc' }],
				take: freeSlots,
				select: { id: true },
			});
			if (toPromote.length > 0) {
				await tx.waitingRoomEntry.updateMany({
					where: { id: { in: toPromote.map((e: { id: number }) => e.id) } },
					data: { status: 'ADMITTED', admittedAt: nowDate },
				});
			}
		}

		const finalEntry = await tx.waitingRoomEntry.findUniqueOrThrow({ where: { eventCode_sessionId: { eventCode, sessionId } } });
		if (finalEntry.status === 'ADMITTED') {
			return { admitted: true, position: null };
		}
		// Posición 1-based entre los QUEUED activos que llegaron antes (empate de joinedAt roto por id).
		const ahead = await tx.waitingRoomEntry.count({
			where: {
				eventCode,
				status: 'QUEUED',
				lastSeenAt: { gt: new Date(now - QUEUE_INACTIVE_TIMEOUT_MS) },
				OR: [{ joinedAt: { lt: finalEntry.joinedAt } }, { joinedAt: finalEntry.joinedAt, id: { lt: finalEntry.id } }],
			},
		});
		return { admitted: false, position: ahead + 1 };
	});
}

export type WaitingRoomResult = {
	enabled: boolean;
	admitted: boolean;
	position: number | null;
	// Solo vienen seteados cuando enabled:true — si no, el frontend sigue directo a cargar el evento
	// completo y no necesita esta info acá.
	tenantName: string | null;
	tenantLogoUrl: string | null;
	eventName: string | null;
	eventImg: string | null;
};

const DISABLED_RESULT = {
	enabled: false as const,
	admitted: true as const,
	position: null,
	tenantName: null,
	tenantLogoUrl: null,
	eventName: null,
	eventImg: null,
};

// Llamado al entrar a /e/:code — si la sala de espera no está prendida para este evento, responde de
// inmediato sin tocar la tabla (cero costo para el 99% de los eventos que no la usan).
export async function joinWaitingRoom(code: string, sessionId: string): Promise<WaitingRoomResult> {
	const config = await getConfig(code);
	if (!config.enabled) {
		return DISABLED_RESULT;
	}
	const { admitted, position } = await computeAdmission(code, sessionId, config.batchSize, Date.now());
	return {
		enabled: true,
		admitted,
		position,
		tenantName: config.tenantName,
		tenantLogoUrl: config.tenantLogoUrl,
		eventName: config.eventName,
		eventImg: config.eventImg,
	};
}

// Polling del frontend mientras espera. Fail-open: si `waitingRoomEnabled` se apagó mientras alguien
// ya estaba esperando, este chequeo lo libera en el siguiente poll en vez de dejarlo colgado.
export async function getWaitingRoomStatus(code: string, sessionId: string): Promise<WaitingRoomResult> {
	const config = await getConfig(code);
	if (!config.enabled) {
		// deleteMany en vez de delete: puede no existir ninguna fila todavía (primer poll antes del
		// primer join) o ya haber sido borrada por el cleanup periódico — no hay nada que reintentar.
		await prisma.waitingRoomEntry.deleteMany({ where: { eventCode: code, sessionId } });
		return DISABLED_RESULT;
	}
	const { admitted, position } = await computeAdmission(code, sessionId, config.batchSize, Date.now());
	return {
		enabled: true,
		admitted,
		position,
		tenantName: config.tenantName,
		tenantLogoUrl: config.tenantLogoUrl,
		eventName: config.eventName,
		eventImg: config.eventImg,
	};
}

export type WaitingRoomStats = { queueCount: number; admittedCount: number };

// Vista de solo lectura para el manager (ver GET /events/:id/waiting-room/stats). Filtra vencidos
// por WHERE, igual que computeAdmission, para que el número que ve el manager coincida con lo que
// realmente va a pasar en el próximo join/poll de un visitante.
export async function getWaitingRoomStats(code: string): Promise<WaitingRoomStats> {
	const now = Date.now();
	const [queueCount, admittedCount] = await Promise.all([
		prisma.waitingRoomEntry.count({ where: { eventCode: code, status: 'QUEUED', lastSeenAt: { gt: new Date(now - QUEUE_INACTIVE_TIMEOUT_MS) } } }),
		prisma.waitingRoomEntry.count({ where: { eventCode: code, status: 'ADMITTED', admittedAt: { gt: new Date(now - ADMISSION_WINDOW_MS) } } }),
	]);
	return { queueCount, admittedCount };
}

// Corrida periódica (ver cron en server.ts) que borra filas que ya no le sirven a nadie — sin esto,
// la tabla crecería sin límite con una fila por cada visitante que alguna vez pasó por una sala de
// espera. No afecta la corrección de ninguna lectura (todas filtran por WHERE de todos modos), es
// pura limpieza de espacio.
export async function cleanupExpiredWaitingRoomEntries(): Promise<void> {
	const now = Date.now();
	await prisma.waitingRoomEntry.deleteMany({
		where: {
			OR: [
				{ status: 'ADMITTED', admittedAt: { lt: new Date(now - ADMISSION_WINDOW_MS) } },
				{ status: 'QUEUED', lastSeenAt: { lt: new Date(now - QUEUE_INACTIVE_TIMEOUT_MS) } },
			],
		},
	});
}
