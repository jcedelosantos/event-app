import { faker } from '@faker-js/faker';
import { User } from '../models/users/user';
import { UserType } from '../models/users/user-type';

function mockUserType(): UserType {
	return {
		id: faker.number.int({ min: 1, max: 100 }),
		name: faker.person.firstName(),
		description: faker.lorem.sentence(),
		type: faker.helpers.arrayElement(['admin', 'user']),
		license: [faker.string.uuid(), faker.string.uuid(), faker.string.uuid()],
	};
}

export function mockUser(): User {
	return {
		id: faker.number.int({ min: 1, max: 100 }),
		username: faker.internet.username(),
		type: mockUserType(),
		name: faker.person.firstName(),
		lastname: faker.person.lastName(),
		gender: faker.person.gender(),
		email: faker.internet.email(),
		carnet: faker.number.int({ min: 1, max: 100 }),
		adress: faker.location.streetAddress(),
		phone: faker.phone.number({ style: 'international' }),
	};
}

export function mockUsers(count = 10): User[] {
	return faker.helpers.multiple(() => mockUser(), { count });
}
