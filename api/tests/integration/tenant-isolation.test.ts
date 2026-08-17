import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app';
import { createAuthenticatedTenant, createMapWithSeats, createTestEvent, createTestSaleTicketsBulk, createTestTicket, resetDatabase } from '../helpers';

// Cobertura de la red de seguridad de aislamiento multi-tenant (tenant-guard extension, ver
// lib/tenant-guard.ts, auditado a mano en la revisión 8 del código). Estos tests no verifican la
// extensión en sí (eso es un chequeo estructural, no de negocio) — verifican que, pegándole a las
// rutas de negocio de mayor exposición como lo haría un cliente real autenticado, un tenant NUNCA
// puede leer ni escribir datos de otro, aunque conozca (o adivine) el id exacto.
describe('Aislamiento multi-tenant — un tenant nunca ve ni toca datos de otro', () => {
	beforeEach(async () => {
		await resetDatabase();
	});

	describe('GET /events', () => {
		it('la lista de un tenant nunca incluye eventos de otro', async () => {
			const tenantA = await createAuthenticatedTenant();
			const tenantB = await createAuthenticatedTenant();
			const eventB = await createTestEvent(tenantB.tenant.id, tenantB.user.id);

			const res = await request(app).get('/events').set('Authorization', `Bearer ${tenantA.token}`);
			expect(res.status).toBe(200);
			expect(res.body.some((e: { id: number }) => e.id === eventB.id)).toBe(false);
		});
	});

	describe('GET/PUT/DELETE /events/:id', () => {
		it('leer el evento de otro tenant por id devuelve 404, no el dato', async () => {
			const tenantA = await createAuthenticatedTenant();
			const tenantB = await createAuthenticatedTenant();
			const eventB = await createTestEvent(tenantB.tenant.id, tenantB.user.id);

			const res = await request(app).get(`/events/${eventB.id}`).set('Authorization', `Bearer ${tenantA.token}`);
			expect(res.status).toBe(404);
		});

		it('editar el evento de otro tenant por id devuelve 404, no lo modifica', async () => {
			const tenantA = await createAuthenticatedTenant();
			const tenantB = await createAuthenticatedTenant();
			const eventB = await createTestEvent(tenantB.tenant.id, tenantB.user.id);

			const res = await request(app)
				.put(`/events/${eventB.id}`)
				.set('Authorization', `Bearer ${tenantA.token}`)
				.send({ name: 'Secuestrado por tenant A' });
			expect(res.status).toBe(404);

			const stillIntact = await request(app).get(`/events/${eventB.id}`).set('Authorization', `Bearer ${tenantB.token}`);
			expect(stillIntact.body.name).toBe(eventB.name);
		});

		it('borrar el evento de otro tenant por id devuelve 404, no lo borra', async () => {
			const tenantA = await createAuthenticatedTenant();
			const tenantB = await createAuthenticatedTenant();
			const eventB = await createTestEvent(tenantB.tenant.id, tenantB.user.id);

			const res = await request(app).delete(`/events/${eventB.id}`).set('Authorization', `Bearer ${tenantA.token}`);
			expect(res.status).toBe(404);

			const stillExists = await request(app).get(`/events/${eventB.id}`).set('Authorization', `Bearer ${tenantB.token}`);
			expect(stillExists.status).toBe(200);
		});
	});

	describe('GET /users', () => {
		it('la lista de usuarios de un tenant nunca incluye usuarios de otro', async () => {
			const tenantA = await createAuthenticatedTenant();
			const tenantB = await createAuthenticatedTenant();

			const res = await request(app).get('/users').set('Authorization', `Bearer ${tenantA.token}`);
			expect(res.status).toBe(200);
			expect(res.body.some((u: { id: number }) => u.id === tenantB.user.id)).toBe(false);
		});

		it('leer el usuario de otro tenant por id devuelve 404, no el dato', async () => {
			const tenantA = await createAuthenticatedTenant();
			const tenantB = await createAuthenticatedTenant();

			const res = await request(app).get(`/users/${tenantB.user.id}`).set('Authorization', `Bearer ${tenantA.token}`);
			expect(res.status).toBe(404);
		});
	});

	describe('GET /sale-tickets', () => {
		it('un tenant no puede listar ventas del evento de otro tenant, ni con el eventId correcto', async () => {
			const tenantA = await createAuthenticatedTenant();
			const tenantB = await createAuthenticatedTenant();
			const { map, seats } = await createMapWithSeats(tenantB.tenant.id, 3);
			const eventB = await createTestEvent(tenantB.tenant.id, tenantB.user.id, { mapId: map.id });
			const ticketB = await createTestTicket(eventB.id, tenantB.tenant.id, { count: 3 });
			await createTestSaleTicketsBulk(seats.map((s) => s.id), { eventId: eventB.id, ticketId: ticketB.id, tenantId: tenantB.tenant.id, userId: tenantB.user.id });

			const res = await request(app).get('/sale-tickets').query({ eventId: eventB.id }).set('Authorization', `Bearer ${tenantA.token}`);
			expect(res.status).toBe(200);
			expect(res.body).toHaveLength(0);
		});
	});
});
