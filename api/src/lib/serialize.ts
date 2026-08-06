import { User, UserType } from '@prisma/client';

type UserWithType = User & {
	type: UserType;
	tenant?: { id: number; name: string; type: string; slug: string; logoUrl: string | null; plan: string | null; planStatus: string | null } | null;
};

export function toPublicUser(user: UserWithType) {
	const { password: _password, type, tenant, ...rest } = user;
	return { ...rest, type: { ...type, license: JSON.parse(type.license) as string[] }, tenant: tenant ?? null };
}
