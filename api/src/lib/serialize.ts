import { User, UserType } from '@prisma/client';

type UserWithType = User & { type: UserType };

export function toPublicUser(user: UserWithType) {
	const { password: _password, type, ...rest } = user;
	return { ...rest, type: { ...type, license: JSON.parse(type.license) as string[] } };
}
