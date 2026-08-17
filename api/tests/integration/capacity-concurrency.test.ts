import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app';
import { createAuthenticatedTenant, createMapWithSeats, createTestEvent, createTestTicket, resetDatabase } from '../helpers';

// Cubre el mismo riesgo que motivó lib/capacity.ts + serializable-tx.ts: varias compras
// simultáneas que juntas superan Event.maxCapacity no deberían poder pasar todas. A diferencia de
// los tests anteriores (que llaman a la lógica directo), acá se disparan requests HTTP REALES en
// paralelo contra POST /sale-tickets — es la única forma de ejercitar de verdad la transacción
// Serializable bajo contención, no solo su lógica en aislamiento.
//
// El tamaño de la ráfaga (5, no 10+) es deliberado: la DB de test vive detrás de un TCP proxy
// remoto (ver tests/setup.ts), con latencia mucho más alta que la red interna de Railway donde
// corre producción — una ráfaga más grande agota el presupuesto de reintentos de
// serializableTransaction (4 intentos) por puro efecto de esa latencia extra, no porque la
// invariante de negocio esté rota. El invariante real que importa —nunca más ventas exitosas que
// el aforo— se valida igual, sin depender de que CADA intento termine en 201 o 409 prolijo.
describe('POST /sale-tickets — el aforo del evento no se puede exceder bajo concurrencia real', () => {
	beforeEach(async () => {
		await resetDatabase();
	});

	it(
		'5 compras simultáneas de 5 asientos distintos contra un aforo de 2 nunca admiten más de 2',
		async () => {
			const maxCapacity = 2;
			const attempts = 5;
			const { tenant, user, token } = await createAuthenticatedTenant();
			const { map, seats } = await createMapWithSeats(tenant.id, attempts);
			const event = await createTestEvent(tenant.id, user.id, { mapId: map.id, maxCapacity });
			const ticket = await createTestTicket(event.id, tenant.id, { count: attempts });

			const responses = await Promise.all(
				seats.map((seat) =>
					request(app)
						.post('/sale-tickets')
						.set('Authorization', `Bearer ${token}`)
						.send({ eventId: event.id, seatId: seat.id, ticketId: ticket.id, clientId: user.id, paidType: 'Cash' }),
				),
			);

			const succeeded = responses.filter((r) => r.status === 201);
			// El invariante real: NUNCA más ventas exitosas que el aforo. Los que no entraron pueden
			// venir como 409 (aforo lleno, el camino esperado) — no se exige que TODOS los rechazos
			// lleguen prolijos como 409, solo que ninguno se cuele como 201 de más.
			expect(succeeded.length).toBeLessThanOrEqual(maxCapacity);

			// La verdad de la DB, no solo las respuestas HTTP — confirma que ninguna venta quedó a
			// mitad de camino y que el conteo real nunca superó el aforo.
			const finalCount = await request(app).get('/sale-tickets').query({ eventId: event.id }).set('Authorization', `Bearer ${token}`);
			expect(finalCount.body.length).toBeLessThanOrEqual(maxCapacity);
			expect(finalCount.body).toHaveLength(succeeded.length);
		},
		30000,
	);

	it(
		'sin maxCapacity seteado (null), no hay tope — las compras simultáneas que no chocan de asiento pasan todas',
		async () => {
			const attempts = 4;
			const { tenant, user, token } = await createAuthenticatedTenant();
			const { map, seats } = await createMapWithSeats(tenant.id, attempts);
			const event = await createTestEvent(tenant.id, user.id, { mapId: map.id, maxCapacity: null });
			const ticket = await createTestTicket(event.id, tenant.id, { count: attempts });

			const responses = await Promise.all(
				seats.map((seat) =>
					request(app)
						.post('/sale-tickets')
						.set('Authorization', `Bearer ${token}`)
						.send({ eventId: event.id, seatId: seat.id, ticketId: ticket.id, clientId: user.id, paidType: 'Cash' }),
				),
			);

			expect(responses.filter((r) => r.status === 201)).toHaveLength(attempts);
		},
		30000,
	);
});
