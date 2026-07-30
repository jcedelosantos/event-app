import { prismaUnscoped } from './prisma';

// Sala de espera virtual en memoria del proceso — seguro porque la app corre como una sola
// instancia de Node en Railway (ver railway.json/Dockerfile, sin numReplicas). Si en el futuro se
// escala a >1 réplica, este diseño deja de ser correcto (cada réplica tendría su propia cola) y
// haría falta migrar a un store compartido (Redis/DB). No hace falta hoy.
//
// El sobrecupo de asientos YA está resuelto en otro lado (constraint único eventId+seatId + hold de
// 15 min, ver public.ts) — esto es puramente para no dejar que un pico de tráfico simultáneo tire
// la query pesada de GET /events/:code sobre todos a la vez.

export type QueueEntry = { sessionId: string; joinedAt: number; lastSeenAt: number };
export type AdmittedEntry = { sessionId: string; admittedAt: number };
type CachedConfig = { enabled: boolean; batchSize: number; cachedAt: number };
type EventQueueState = { queue: Map<string, QueueEntry>; admitted: Map<string, AdmittedEntry>; config: CachedConfig | null };

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

const statesByEventCode = new Map<string, EventQueueState>();

function getOrCreateState(code: string): EventQueueState {
	let state = statesByEventCode.get(code);
	if (!state) {
		state = { queue: new Map(), admitted: new Map(), config: null };
		statesByEventCode.set(code, state);
	}
	return state;
}

// Si la cola y los admitidos quedan vacíos no hay razón para seguir reteniendo el estado del evento
// en memoria — se recrea solo en el próximo join. Sin esto, un proceso que vive semanas en Railway
// acumularía una entrada por cada evento que alguna vez usó sala de espera (leak lento, chico pero
// innecesario).
function pruneStateIfEmpty(code: string, state: EventQueueState) {
	if (state.queue.size === 0 && state.admitted.size === 0) {
		statesByEventCode.delete(code);
	}
}

async function getConfig(code: string, state: EventQueueState): Promise<{ enabled: boolean; batchSize: number }> {
	const now = Date.now();
	if (state.config && now - state.config.cachedAt < CONFIG_TTL_MS) {
		return state.config;
	}
	const event = await prismaUnscoped.event.findUnique({
		where: { code },
		select: { waitingRoomEnabled: true, waitingRoomBatchSize: true },
	});
	const config: CachedConfig = {
		enabled: !!event?.waitingRoomEnabled,
		batchSize: event?.waitingRoomBatchSize ?? DEFAULT_BATCH_SIZE,
		cachedAt: now,
	};
	state.config = config;
	return config;
}

// Única función con lógica real, 100% síncrona a propósito — todo el `await` de config se resuelve
// ANTES de llamar a esto, para que dos requests concurrentes al mismo evento no se pisen mutaciones
// de `queue`/`admitted` en medio de un `await` (Node es single-threaded pero un `await` sí cede el
// control a otro request).
function computeAdmission(state: EventQueueState, sessionId: string, batchSize: number, now: number): { admitted: boolean; position: number | null } {
	// Poda admitidos cuya ventana ya venció.
	for (const [sid, entry] of state.admitted) {
		if (now - entry.admittedAt > ADMISSION_WINDOW_MS) {
			state.admitted.delete(sid);
		}
	}
	// Poda entradas de la cola sin actividad reciente (pestaña cerrada/abandonada).
	for (const [sid, entry] of state.queue) {
		if (now - entry.lastSeenAt > QUEUE_INACTIVE_TIMEOUT_MS) {
			state.queue.delete(sid);
		}
	}

	// Idempotente por sessionId: si ya está admitido (incluye el caso de pestaña duplicada, que
	// copia el sessionId de sessionStorage), no hay nada más que hacer.
	if (state.admitted.has(sessionId)) {
		return { admitted: true, position: null };
	}

	if (!state.queue.has(sessionId)) {
		state.queue.set(sessionId, { sessionId, joinedAt: now, lastSeenAt: now });
	} else {
		state.queue.get(sessionId)!.lastSeenAt = now;
	}

	// Si el manager bajó el batchSize a mitad de venta, NO se expulsa a nadie ya admitido (podrían
	// estar a mitad de un checkout) — simplemente se deja de promover gente nueva hasta que la
	// cantidad de admitidos baje sola por vencimiento de ventana.
	const queued = [...state.queue.values()].sort((a, b) => a.joinedAt - b.joinedAt);
	for (const entry of queued) {
		if (state.admitted.size >= batchSize) break;
		state.admitted.set(entry.sessionId, { sessionId: entry.sessionId, admittedAt: now });
		state.queue.delete(entry.sessionId);
	}

	if (state.admitted.has(sessionId)) {
		return { admitted: true, position: null };
	}
	const position = [...state.queue.values()].sort((a, b) => a.joinedAt - b.joinedAt).findIndex((e) => e.sessionId === sessionId);
	return { admitted: false, position: position + 1 };
}

export type WaitingRoomResult = { enabled: boolean; admitted: boolean; position: number | null };

// Llamado al entrar a /e/:code — si la sala de espera no está prendida para este evento, responde de
// inmediato sin tocar ningún estado en memoria (cero costo para el 99% de los eventos que no la usan).
export async function joinWaitingRoom(code: string, sessionId: string): Promise<WaitingRoomResult> {
	const state = getOrCreateState(code);
	const { enabled, batchSize } = await getConfig(code, state);
	if (!enabled) {
		pruneStateIfEmpty(code, state);
		return { enabled: false, admitted: true, position: null };
	}
	const { admitted, position } = computeAdmission(state, sessionId, batchSize, Date.now());
	return { enabled: true, admitted, position };
}

// Polling del frontend mientras espera. Fail-open: si `waitingRoomEnabled` se apagó mientras alguien
// ya estaba esperando, este chequeo lo libera en el siguiente poll en vez de dejarlo colgado.
export async function getWaitingRoomStatus(code: string, sessionId: string): Promise<WaitingRoomResult> {
	const state = getOrCreateState(code);
	const { enabled, batchSize } = await getConfig(code, state);
	if (!enabled) {
		state.queue.delete(sessionId);
		state.admitted.delete(sessionId);
		pruneStateIfEmpty(code, state);
		return { enabled: false, admitted: true, position: null };
	}
	const { admitted, position } = computeAdmission(state, sessionId, batchSize, Date.now());
	pruneStateIfEmpty(code, state);
	return { enabled: true, admitted, position };
}
