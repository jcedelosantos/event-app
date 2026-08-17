import bcrypt from 'bcryptjs';
import request from 'supertest';
import { app } from '../src/app';
import { prismaUnscoped } from '../src/lib/prisma';

// Reexport para que los archivos de test no tengan que importar de dos lugares distintos.
export { prismaUnscoped as prisma };

// Sufijo random para que cada test cree datos con nombres únicos (slug de tenant, username, email)
// sin pisarse entre sí — incluso corriendo en serie (ver vitest.config.ts fileParallelism:false),
// esto evita depender de un orden de ejecución implícito.
export function uniqueSuffix(): string {
	return Math.random().toString(36).slice(2, 10);
}

// Trunca TODAS las tablas de la app (todo lo que no sea la tabla interna de Prisma) antes de cada
// test — más simple y a prueba de cambios de schema que borrar tabla por tabla en orden de FKs.
// Solo corre contra integ_app_test (ver tests/setup.ts, DATABASE_URL fijo ahí) — jamás toca
// producción ni load-test, viven en bases Postgres separadas.
export async function resetDatabase(): Promise<void> {
	const tables = await prismaUnscoped.$queryRaw<{ tablename: string }[]>`
		SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename NOT LIKE '\\_prisma%'
	`;
	if (tables.length === 0) return;
	const names = tables.map((t) => `"${t.tablename}"`).join(', ');
	await prismaUnscoped.$executeRawUnsafe(`TRUNCATE TABLE ${names} RESTART IDENTITY CASCADE`);
}

// UserType no se siembra en la DB de test (a diferencia de dev local, ver prisma/seed.ts) —
// SEED_DEMO_DATA no está seteado en .env.test a propósito (mismo criterio de seguridad que
// producción). Cada test que necesita loguearse crea el UserType que le hace falta acá.
export async function ensureUserType(type: 'ROOT' | 'USER' | 'CLIENT' | 'SUPERADMIN' | 'SCANNER'): Promise<{ id: number }> {
	const license = type === 'USER' ? ['SALE', 'MAP', 'RELEASE_SEAT'] : type === 'CLIENT' ? ['BUY'] : type === 'SCANNER' ? ['SCAN'] : ['*'];
	const existing = await prismaUnscoped.userType.findFirst({ where: { type } });
	if (existing) return existing;
	return prismaUnscoped.userType.create({ data: { name: type, description: type, type, license: JSON.stringify(license) } });
}

export async function createTestTenant(overrides: Partial<{ name: string; slug: string; plan: string | null; planStatus: string | null }> = {}) {
	const suffix = uniqueSuffix();
	return prismaUnscoped.tenant.create({
		data: {
			name: overrides.name ?? `Test Tenant ${suffix}`,
			slug: overrides.slug ?? `test-tenant-${suffix}`,
			plan: overrides.plan ?? null,
			planStatus: overrides.planStatus ?? null,
		},
	});
}

export async function createTestUser(tenantId: number, opts: { type?: 'ROOT' | 'USER' | 'CLIENT' | 'SCANNER'; password?: string } = {}) {
	const userType = await ensureUserType(opts.type ?? 'ROOT');
	const suffix = uniqueSuffix();
	const password = opts.password ?? 'test-password-123';
	const user = await prismaUnscoped.user.create({
		data: {
			username: `test-user-${suffix}`,
			password: await bcrypt.hash(password, 10),
			typeId: userType.id,
			name: 'Test',
			lastname: 'User',
			gender: '',
			email: `test-${suffix}@example.com`,
			carnet: suffix,
			adress: '',
			phone: '',
			tenantId,
		},
	});
	return { user, password };
}

// Crea tenant + usuario ROOT + loguea vía la API real (POST /auth/login) — devuelve el token listo
// para usar en el header Authorization de los tests. Pasa por el login real (no arma el JWT a
// mano) para que un cambio futuro en auth.ts se refleje automáticamente en todos los tests.
export async function createAuthenticatedTenant(overrides: Parameters<typeof createTestTenant>[0] = {}) {
	const tenant = await createTestTenant(overrides);
	const { user, password } = await createTestUser(tenant.id);
	const res = await request(app).post('/auth/login').send({ username: user.username, password });
	if (res.status !== 200) {
		throw new Error(`login de fixture falló: ${res.status} ${JSON.stringify(res.body)}`);
	}
	return { tenant, user, token: res.body.token as string };
}

// Valores dummy para los campos puramente visuales del picker (x/y/radio/color/etc.) — a los
// tests de dinero/aislamiento/concurrencia no les importa cómo se ve el mapa, solo que las FKs
// existan y que haya asientos reales para poder crear SaleTicket (seatId es NOT NULL). Seat no
// tiene backGround (a diferencia de Map/Area), de ahí los dos objetos separados.
const VISUAL_DEFAULTS = { x: 0, y: 0, radio: 1, color: '#000', size: 1, backGround: '' };
const SEAT_VISUAL_DEFAULTS = { x: 0, y: 0, radio: 1, color: '#000', size: 1 };

export async function createMapWithSeats(tenantId: number, seatCount: number) {
	const suffix = uniqueSuffix();
	const map = await prismaUnscoped.map.create({
		data: { name: `Test Map ${suffix}`, description: '', img: '', type: 'GENERAL', totalTables: 0, totalTablesSeat: 0, totalSeats: seatCount, tenantId, ...VISUAL_DEFAULTS },
	});
	const area = await prismaUnscoped.area.create({
		data: { name: `Test Area ${suffix}`, description: '', img: '', icon: '', type: 'GENERAL', totalTables: 0, totalSeats: seatCount, totalCount: seatCount, mapId: map.id, tenantId, ...VISUAL_DEFAULTS },
	});
	const seats = await Promise.all(
		Array.from({ length: seatCount }, (_, i) =>
			prismaUnscoped.seat.create({ data: { name: `Seat ${i + 1}`, icon: '', type: 'GENERAL', areaId: area.id, tenantId, ...SEAT_VISUAL_DEFAULTS } }),
		),
	);
	return { map, area, seats };
}

export async function createTestEvent(
	tenantId: number,
	userId: number,
	overrides: Partial<{ mapId: number | null; dateOn: Date; maxCapacity: number | null }> = {},
) {
	const suffix = uniqueSuffix();
	const now = new Date();
	return prismaUnscoped.event.create({
		data: {
			name: `Test Event ${suffix}`,
			img: '',
			code: `TST-${suffix}`,
			type: 'GENERAL',
			description: '',
			dateSale: now,
			dateOn: overrides.dateOn ?? now,
			dateOff: overrides.dateOn ?? now,
			userId,
			tenantId,
			mapId: overrides.mapId ?? null,
			maxCapacity: overrides.maxCapacity ?? null,
		},
	});
}

export async function createTestTicket(eventId: number, tenantId: number, overrides: Partial<{ priceCents: number; count: number }> = {}) {
	const suffix = uniqueSuffix();
	return prismaUnscoped.ticket.create({
		data: {
			img: '',
			code: `TCK-${suffix}`,
			name: `Test Ticket ${suffix}`,
			description: '',
			type: 'GENERAL',
			count: overrides.count ?? 1000,
			priceCents: overrides.priceCents ?? 1000,
			eventId,
			tenantId,
		},
	});
}

// clientId/userId (vendedor) pueden ser el mismo usuario para simplificar los fixtures — la FK
// solo exige que ambos sean Users válidos del sistema, no impone que sean distintos.
export async function createTestSaleTicket(
	opts: { eventId: number; seatId: number; ticketId: number; tenantId: number; userId: number; clientId?: number; priceCents?: number | null },
) {
	const suffix = uniqueSuffix();
	return prismaUnscoped.saleTicket.create({
		data: {
			description: '',
			paidType: 'Cash',
			codeQR: `QR-${suffix}`,
			eventId: opts.eventId,
			seatId: opts.seatId,
			ticketId: opts.ticketId,
			userId: opts.userId,
			clientId: opts.clientId ?? opts.userId,
			tenantId: opts.tenantId,
			priceCents: opts.priceCents,
		},
	});
}

// Versión bulk de arriba, una fila por seat — un solo round-trip a Postgres en vez de uno por
// asiento. La DB de test vive detrás de un TCP proxy remoto (ver tests/setup.ts): insertar de a
// uno para fixtures de 50+ asientos es lento a propósito por la latencia de red, no por Postgres
// en sí, y termina pisando el timeout del test.
export async function createTestSaleTicketsBulk(seatIds: number[], opts: { eventId: number; ticketId: number; tenantId: number; userId: number; clientId?: number; priceCents?: number | null }) {
	await prismaUnscoped.saleTicket.createMany({
		data: seatIds.map((seatId) => ({
			description: '',
			paidType: 'Cash',
			codeQR: `QR-${uniqueSuffix()}`,
			eventId: opts.eventId,
			seatId,
			ticketId: opts.ticketId,
			userId: opts.userId,
			clientId: opts.clientId ?? opts.userId,
			tenantId: opts.tenantId,
			priceCents: opts.priceCents,
		})),
	});
}
