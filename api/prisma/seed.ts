import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
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

	const hashedAdmin = await bcrypt.hash('1234', 10);
	const hashedUser = await bcrypt.hash('1234', 10);

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
		},
	});

	console.log('Seed completado: 3 tipos de usuario, 2 usuarios (admin/1234, User/1234)');
}

main()
	.catch((err) => {
		console.error(err);
		process.exit(1);
	})
	.finally(() => prisma.$disconnect());
