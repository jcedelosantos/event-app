import { User, UserType } from '@prisma/client';

type UserWithType = User & { type: UserType; tenant?: { id: number; name: string } | null };

export function toPublicUser(user: UserWithType) {
	const { password: _password, type, tenant, ...rest } = user;
	return { ...rest, type: { ...type, license: JSON.parse(type.license) as string[] }, tenant: tenant ?? null };
}
