import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
	// El CMD del Dockerfile corre este script en TODO arranque de contenedor, en TODO ambiente (ver
	// Dockerfile: `prisma migrate deploy && tsx prisma/seed.ts && node dist/server.js`) — incluyendo
	// un ambiente nuevo con Postgres recién provisionado y todavía sin tenants (ej. el ambiente
	// `load-test` de esta sesión, o un restore de disaster-recovery a una DB vacía). Sin este opt-in
	// explícito, ese primer arranque crearía en silencio una cuenta SUPERADMIN real con password
	// "1234" — utilizable contra cualquier tenant del sistema. Requerir SEED_DEMO_DATA=true (nunca
	// seteada en Railway producción/load-test, solo en el .env local de un dev) hace que ese
	// escenario sea imposible por default en vez de depender de que siempre haya un tenant ya creado.
	if (process.env.SEED_DEMO_DATA !== 'true') {
		console.log('SEED_DEMO_DATA no está en "true" — se omite el seed de datos demo (esperado en producción).');
		return;
	}

	// Solo para bases de datos nuevas/vacías (dev local recién clonado). En producción, el tenant
	// real y el superadmin ya los crea la migración de datos (ver
	// prisma/migrations/20260714135300_backfill_tenant_data) — si ya hay un tenant, correr esto de
	// nuevo solo agregaría una organización "Demo" fantasma al panel de Super Admin.
	const existingTenantCount = await prisma.tenant.count();
	if (existingTenantCount > 0) {
		console.log('Ya existe al menos un tenant — se omite el seed (esto es esperado en producción).');
		return;
	}

	const tenant = await prisma.tenant.upsert({
		where: { slug: 'demo' },
		update: {},
		create: { name: 'Demo', slug: 'demo' },
	});

	const admin = await prisma.userType.upsert({
		where: { id: 1 },
		update: {},
		create: { name: 'Admin', description: 'Administrator', type: 'ROOT', license: JSON.stringify(['*']) },
	});
	const user = await prisma.userType.upsert({
		where: { id: 2 },
		update: { license: JSON.stringify(['SALE', 'MAP', 'RELEASE_SEAT']) },
		create: { name: 'User', description: 'User', type: 'USER', license: JSON.stringify(['SALE', 'MAP', 'RELEASE_SEAT']) },
	});
	await prisma.userType.upsert({
		where: { id: 3 },
		update: {},
		create: { name: 'Client', description: 'Client', type: 'CLIENT', license: JSON.stringify(['BUY']) },
	});
	// Rol global (no pertenece a ningún tenant, ver Tenant.md/plan) para el panel de Super Admin que
	// da de alta nuevos clientes (clubes/iglesias) desde /tenants.
	const superAdminType = await prisma.userType.upsert({
		where: { id: 4 },
		update: {},
		create: { name: 'Super Admin', description: 'Super Admin', type: 'SUPERADMIN', license: JSON.stringify(['*']) },
	});
	// Rol restringido a escanear un solo evento (ver User.scannerEventId, middleware/auth.ts
	// blockScannerRole) — en producción esta fila la inserta la migración
	// 20260816044500_add_scanner_role, no este seed.
	await prisma.userType.upsert({
		where: { id: 5 },
		update: {},
		create: { name: 'Escáner', description: 'Scanner', type: 'SCANNER', license: JSON.stringify(['SCAN']) },
	});

	const hashedAdmin = await bcrypt.hash('1234', 10);
	const hashedUser = await bcrypt.hash('1234', 10);
	const hashedSuperAdmin = await bcrypt.hash('1234', 10);

	await prisma.user.upsert({
		where: { username: 'admin' },
		update: {},
		create: {
			username: 'admin',
			password: hashedAdmin,
			typeId: admin.id,
			name: 'Miguel',
			lastname: 'Pena',
			gender: 'M',
			email: 'miguel@gmail.com',
			carnet: '12345678',
			adress: 'SD',
			phone: '80912345678',
			tenantId: tenant.id,
		},
	});

	await prisma.user.upsert({
		where: { username: 'User' },
		update: {},
		create: {
			username: 'User',
			password: hashedUser,
			typeId: user.id,
			name: 'Luis',
			lastname: 'Pena',
			gender: 'M',
			email: 'luisl@gmail.com',
			carnet: '12341234',
			adress: 'SD',
			phone: '80912345679',
			tenantId: tenant.id,
		},
	});

	// tenantId se deja sin asignar (null) a propósito — es la única cuenta del sistema que no
	// pertenece a ningún cliente, ver requireTenant en middleware/auth.ts.
	await prisma.user.upsert({
		where: { username: 'superadmin' },
		update: {},
		create: {
			username: 'superadmin',
			password: hashedSuperAdmin,
			typeId: superAdminType.id,
			name: 'Super',
			lastname: 'Admin',
			gender: '',
			email: 'superadmin@seat-app.local',
			carnet: '',
			adress: '',
			phone: '',
		},
	});

	console.log('Seed completado: tenant demo, 4 tipos de usuario, 3 usuarios (admin/1234, User/1234, superadmin/1234)');
}

main()
	.catch((err) => {
		console.error(err);
		process.exit(1);
	})
	.finally(() => prisma.$disconnect());
