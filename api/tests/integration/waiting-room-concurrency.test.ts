import { beforeEach, describe, expect, it } from 'vitest';
import { getWaitingRoomStats, joinWaitingRoom } from '../../src/lib/waiting-room';
import { createTestEvent, createTestTenant, createTestUser, prisma, resetDatabase } from '../helpers';

// Automatiza lo que se verificó a mano contra producción real el 2026-08-16 (ver memoria
// seat-app-revision-4-7-9): la admisión de la sala de espera corre entera dentro de una
// transacción Serializable (ver lib/waiting-room.ts) para que N requests concurrentes, aunque
// vengan de réplicas distintas, nunca admitan más gente de la que permite batchSize. Acá se
// dispara la concurrencia real con Promise.all sobre joinWaitingRoom, no una llamada secuencial —
// es la única forma de ejercitar la protección de la transacción bajo contención de verdad.
//
// El tamaño de la ráfaga (4, no 8+) es deliberado: la DB de test vive detrás de un TCP proxy
// remoto (ver tests/setup.ts), con mucha más latencia que la red interna de Railway donde corre
// producción — una ráfaga más grande agota el presupuesto de reintentos de serializableTransaction
// por puro efecto de esa latencia extra, sin que la invariante de negocio esté rota.
describe('lib/waiting-room.ts — la admisión no excede batchSize bajo concurrencia real', () => {
	beforeEach(async () => {
		await resetDatabase();
	});

	it(
		'con batchSize=1, 4 joins simultáneos de sesiones distintas admiten exactamente 1',
		async () => {
			const batchSize = 1;
			const joiners = 4;
			const tenant = await createTestTenant();
			const { user } = await createTestUser(tenant.id);
			const event = await createTestEvent(tenant.id, user.id);
			await prisma.event.update({ where: { id: event.id }, data: { waitingRoomEnabled: true, waitingRoomBatchSize: batchSize } });

			const sessionIds = Array.from({ length: joiners }, (_, i) => `session-${i}`);
			const results = await Promise.all(sessionIds.map((sessionId) => joinWaitingRoom(event.code, sessionId)));

			const admitted = results.filter((r) => r.admitted);
			const queued = results.filter((r) => !r.admitted);
			expect(admitted).toHaveLength(batchSize);
			expect(queued).toHaveLength(joiners - batchSize);

			// Las posiciones de los que quedaron en cola deben ser un rango 1..N sin huecos ni
			// repetidos — si dos requests concurrentes se pisaran, aparecerían posiciones duplicadas.
			const positions = queued.map((r) => r.position).sort((a, b) => (a ?? 0) - (b ?? 0));
			expect(positions).toEqual(Array.from({ length: joiners - batchSize }, (_, i) => i + 1));

			const stats = await getWaitingRoomStats(event.code);
			expect(stats).toEqual({ queueCount: joiners - batchSize, admittedCount: batchSize });
		},
		30000,
	);

	it(
		'un join repetido de una sesión ya admitida es idempotente — no libera ni ocupa un lugar extra',
		async () => {
			const batchSize = 1;
			const tenant = await createTestTenant();
			const { user } = await createTestUser(tenant.id);
			const event = await createTestEvent(tenant.id, user.id);
			await prisma.event.update({ where: { id: event.id }, data: { waitingRoomEnabled: true, waitingRoomBatchSize: batchSize } });

			const first = await joinWaitingRoom(event.code, 'session-A');
			expect(first.admitted).toBe(true);

			// 3 polls concurrentes de la MISMA sesión ya admitida — ninguno debería crear una fila
			// nueva ni cambiar el resultado.
			const repeats = await Promise.all(Array.from({ length: 3 }, () => joinWaitingRoom(event.code, 'session-A')));
			expect(repeats.every((r) => r.admitted && r.position === null)).toBe(true);

			const stats = await getWaitingRoomStats(event.code);
			expect(stats).toEqual({ queueCount: 0, admittedCount: 1 });
		},
		30000,
	);

	it('evento sin waitingRoomEnabled responde enabled:false sin tocar la tabla', async () => {
		const tenant = await createTestTenant();
		const { user } = await createTestUser(tenant.id);
		const event = await createTestEvent(tenant.id, user.id);

		const result = await joinWaitingRoom(event.code, 'session-A');
		expect(result).toMatchObject({ enabled: false, admitted: true, position: null });

		const stats = await getWaitingRoomStats(event.code);
		expect(stats).toEqual({ queueCount: 0, admittedCount: 0 });
	});
});
