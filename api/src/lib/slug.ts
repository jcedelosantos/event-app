import { prismaUnscoped } from './prisma';

// Compartido entre routes/tenants.ts (alta por Super Admin) y routes/signup.ts (alta pública) —
// mismo criterio de slug en los dos caminos de creación de Tenant.
export function slugify(name: string): string {
	return name
		.toLowerCase()
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/(^-|-$)/g, '');
}

export async function uniqueTenantSlug(name: string, db: typeof prismaUnscoped = prismaUnscoped): Promise<string> {
	const baseSlug = slugify(name) || 'org';
	let slug = baseSlug;
	let suffix = 1;
	while (await db.tenant.findUnique({ where: { slug } })) {
		suffix += 1;
		slug = `${baseSlug}-${suffix}`;
	}
	return slug;
}
