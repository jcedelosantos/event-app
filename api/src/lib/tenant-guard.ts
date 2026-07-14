import { Prisma } from '@prisma/client';

// Red de seguridad para el aislamiento multi-tenant: el filtrado real por tenantId vive explícito
// en cada ruta (ver events.ts, maps.ts, etc.), pero si alguna ruta se olvida de agregarlo, esta
// extensión revienta la query en vez de dejarla correr y filtrar (o mutar) datos de todos los
// tenants a la vez. Se aplica sobre el client compartido (ver prisma.ts), así que también cubre
// las queries hechas dentro de $transaction.
const TENANT_SCOPED_MODELS = new Set([
	'Event',
	'Map',
	'Area',
	'Table',
	'Seat',
	'Ticket',
	'Product',
	'SaleTicket',
	'SaleProduct',
	'AuditLog',
	'AppSetting',
]);

const READ_OR_TARGETED_WRITE_OPS = new Set([
	'findFirst',
	'findFirstOrThrow',
	'findMany',
	'findUnique',
	'findUniqueOrThrow',
	'update',
	'updateMany',
	'delete',
	'deleteMany',
	'count',
	'aggregate',
	'groupBy',
]);

const CREATE_OPS = new Set(['create', 'createMany']);

class MissingTenantScopeError extends Error {
	constructor(model: string, operation: string) {
		super(
			`[tenant-guard] "${model}.${operation}" no trae tenantId en su where/data — se bloquea para no arriesgar una fuga de datos entre organizaciones. Agregá tenantId explícito a esta query.`,
		);
	}
}

function hasTenantId(value: unknown): boolean {
	return typeof value === 'object' && value !== null && 'tenantId' in value && (value as { tenantId?: unknown }).tenantId != null;
}

export function tenantGuardExtension() {
	return Prisma.defineExtension({
		name: 'tenant-guard',
		query: {
			$allModels: {
				async $allOperations({ model, operation, args, query }) {
					if (!model || !TENANT_SCOPED_MODELS.has(model)) {
						return query(args);
					}

					if (READ_OR_TARGETED_WRITE_OPS.has(operation)) {
						const where = (args as { where?: unknown })?.where;
						if (!hasTenantId(where)) {
							throw new MissingTenantScopeError(model, operation);
						}
					} else if (CREATE_OPS.has(operation)) {
						const data = (args as { data?: unknown })?.data;
						const rows = Array.isArray(data) ? data : [data];
						if (rows.some((row) => !hasTenantId(row))) {
							throw new MissingTenantScopeError(model, operation);
						}
					} else if (operation === 'upsert') {
						const upsertArgs = args as { where?: unknown; create?: unknown };
						if (!hasTenantId(upsertArgs?.where) || !hasTenantId(upsertArgs?.create)) {
							throw new MissingTenantScopeError(model, operation);
						}
					}

					return query(args);
				},
			},
		},
	});
}
