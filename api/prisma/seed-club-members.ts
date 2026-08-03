import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Datos de prueba para simular el sistema de membresía real del club (ver lib/club-members.ts) —
// NO son socios reales. Carnet en el mismo formato que ya exige el frontend (una letra + 4
// dígitos, ver CARNET_PATTERN en public-event.component.ts). Idempotente (upsert por
// tenantId+carnet): correr esto de nuevo no duplica filas.
const TEST_MEMBERS = [
	{ carnet: 'j4821', name: 'José', lastname: 'Ramírez', email: 'jose.ramirez@example.com', phone: '8091234501', active: true },
	{ carnet: 'm3390', name: 'María', lastname: 'Peña', email: 'maria.pena@example.com', phone: '8091234502', active: true },
	{ carnet: 'c6735', name: 'Carlos', lastname: 'Ureña', email: 'carlos.urena@example.com', phone: '8091234503', active: true },
	{ carnet: 'a1204', name: 'Ana', lastname: 'Vásquez', email: 'ana.vasquez@example.com', phone: '8091234504', active: true },
	{ carnet: 'l5567', name: 'Luis', lastname: 'Fernández', email: 'luis.fernandez@example.com', phone: '8091234505', active: true },
	{ carnet: 'r2298', name: 'Rosa', lastname: 'Núñez', email: 'rosa.nunez@example.com', phone: '8091234506', active: true },
	{ carnet: 'p8841', name: 'Pedro', lastname: 'Guzmán', email: 'pedro.guzman@example.com', phone: '8091234507', active: true },
	{ carnet: 's1123', name: 'Sandra', lastname: 'Reyes', email: 'sandra.reyes@example.com', phone: '8091234508', active: true },
	{ carnet: 'f7756', name: 'Fernando', lastname: 'Cabrera', email: 'fernando.cabrera@example.com', phone: '8091234509', active: true },
	{ carnet: 'e4409', name: 'Elena', lastname: 'Mercedes', email: 'elena.mercedes@example.com', phone: '8091234510', active: true },
	// Inactivos — para probar el bloqueo (cuota vencida, membresía suspendida, etc.).
	{ carnet: 'g9912', name: 'Gustavo', lastname: 'Almonte', email: 'gustavo.almonte@example.com', phone: '8091234511', active: false },
	{ carnet: 'v3345', name: 'Valeria', lastname: 'Objío', email: 'valeria.objio@example.com', phone: '8091234512', active: false },
];

async function main() {
	const tenant = await prisma.tenant.findUnique({ where: { slug: 'club-deportivo-naco' } });
	if (!tenant) {
		console.log('No se encontró el tenant "club-deportivo-naco" — se omite el seed de socios de prueba.');
		return;
	}

	for (const member of TEST_MEMBERS) {
		await prisma.clubMember.upsert({
			where: { tenantId_carnet: { tenantId: tenant.id, carnet: member.carnet } },
			update: { name: member.name, lastname: member.lastname, email: member.email, phone: member.phone, active: member.active },
			create: { ...member, tenantId: tenant.id },
		});
	}

	console.log(`Listo: ${TEST_MEMBERS.length} socios de prueba (${TEST_MEMBERS.filter((m) => m.active).length} activos, ${TEST_MEMBERS.filter((m) => !m.active).length} inactivos) para el tenant "${tenant.name}".`);
}

main()
	.catch((e) => {
		console.error(e);
		process.exitCode = 1;
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
