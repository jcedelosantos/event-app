import { beforeEach, describe, expect, it } from 'vitest';
import { computeEventOverage, computeTenantOverage } from '../../src/lib/overage';
import { OVERAGE_FEE_PER_PERSON_CENTS, PLANS } from '../../src/lib/plans';
import { createMapWithSeats, createTestEvent, createTestSaleTicketsBulk, createTestTenant, createTestTicket, createTestUser, resetDatabase } from '../helpers';

describe('lib/overage.ts — cálculo de excedente contra un plan real', () => {
	beforeEach(async () => {
		await resetDatabase();
	});

	it('tenant sin plan asignado no genera overage (sin restricción, ver comentario en middleware/plan.ts)', async () => {
		const tenant = await createTestTenant({ plan: null });
		const result = await computeTenantOverage(tenant.id);
		expect(result).toEqual({ totalCents: 0, events: [] });
	});

	it('vender exactamente el cupo incluido del plan no genera overage', async () => {
		const included = PLANS.BASICO.attendeesPerEvent; // 50
		const tenant = await createTestTenant({ plan: 'BASICO', planStatus: 'ACTIVE' });
		const { user } = await createTestUser(tenant.id);
		const { map, seats } = await createMapWithSeats(tenant.id, included);
		const event = await createTestEvent(tenant.id, user.id, { mapId: map.id });
		const ticket = await createTestTicket(event.id, tenant.id, { priceCents: 1000, count: included });

		await createTestSaleTicketsBulk(seats.map((s) => s.id), { eventId: event.id, ticketId: ticket.id, tenantId: tenant.id, userId: user.id, priceCents: 1000 });

		const result = await computeTenantOverage(tenant.id);
		expect(result.totalCents).toBe(0);
		expect(result.events).toHaveLength(0);
	});

	it('vender por encima del cupo cobra exactamente feePerPersonCents por cada asistente de más', async () => {
		const included = PLANS.BASICO.attendeesPerEvent; // 50
		const overBy = 7;
		const tenant = await createTestTenant({ plan: 'BASICO', planStatus: 'ACTIVE' });
		const { user } = await createTestUser(tenant.id);
		const { map, seats } = await createMapWithSeats(tenant.id, included + overBy);
		const event = await createTestEvent(tenant.id, user.id, { mapId: map.id });
		const ticket = await createTestTicket(event.id, tenant.id, { priceCents: 1000, count: included + overBy });

		await createTestSaleTicketsBulk(seats.map((s) => s.id), { eventId: event.id, ticketId: ticket.id, tenantId: tenant.id, userId: user.id, priceCents: 1000 });

		const expectedOverageCents = overBy * OVERAGE_FEE_PER_PERSON_CENTS;

		const tenantResult = await computeTenantOverage(tenant.id);
		expect(tenantResult.totalCents).toBe(expectedOverageCents);
		expect(tenantResult.events).toHaveLength(1);
		expect(tenantResult.events[0]).toMatchObject({ eventId: event.id, soldCount: included + overBy, included, overageCount: overBy, overageCents: expectedOverageCents });

		// GET /events/:id (badge de event-details) usa este otro entrypoint — mismo número, sin
		// tener que recorrer el resto de los eventos del tenant.
		const eventResult = await computeEventOverage(tenant.id, event.id);
		expect(eventResult?.overageCents).toBe(expectedOverageCents);
	});

	it('el overage se calcula POR EVENTO, no acumulado entre eventos del mismo tenant', async () => {
		const included = PLANS.BASICO.attendeesPerEvent;
		const tenant = await createTestTenant({ plan: 'BASICO', planStatus: 'ACTIVE' });
		const { user } = await createTestUser(tenant.id);

		// Evento A: bien por debajo del cupo.
		const { map: mapA, seats: seatsA } = await createMapWithSeats(tenant.id, 10);
		const eventA = await createTestEvent(tenant.id, user.id, { mapId: mapA.id });
		const ticketA = await createTestTicket(eventA.id, tenant.id, { count: 10 });
		await createTestSaleTicketsBulk(seatsA.map((s) => s.id), { eventId: eventA.id, ticketId: ticketA.id, tenantId: tenant.id, userId: user.id });

		// Evento B: se pasa del cupo por 3.
		const { map: mapB, seats: seatsB } = await createMapWithSeats(tenant.id, included + 3);
		const eventB = await createTestEvent(tenant.id, user.id, { mapId: mapB.id });
		const ticketB = await createTestTicket(eventB.id, tenant.id, { count: included + 3 });
		await createTestSaleTicketsBulk(seatsB.map((s) => s.id), { eventId: eventB.id, ticketId: ticketB.id, tenantId: tenant.id, userId: user.id });

		const result = await computeTenantOverage(tenant.id);
		// Solo el evento B aparece — A no resta ni suma nada al total del tenant.
		expect(result.events).toHaveLength(1);
		expect(result.events[0].eventId).toBe(eventB.id);
		expect(result.totalCents).toBe(3 * OVERAGE_FEE_PER_PERSON_CENTS);
	});
});
