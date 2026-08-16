import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth, requireTenant, blockScannerRole, AuthenticatedRequest } from '../middleware/auth';
import { requireActiveSubscription, requirePlan } from '../middleware/plan';
import { asyncHandler } from '../lib/async-handler';
import { logAudit } from '../lib/audit';

export const productsRouter = Router();
// Venta de productos es una feature de Intermedio para arriba (ver plan económico) — Básico no la
// incluye.
productsRouter.use(requireAuth, requireTenant, blockScannerRole, requireActiveSubscription, requirePlan('productsModule'));

const productInputSchema = z.object({
	name: z.string().min(1),
	// Sin .min(1): la tarjeta del producto ya cae a una imagen por default cuando está vacío (ver
	// product-card.component.ts) — antes esto bloqueaba la creación de un producto hasta tener una
	// URL de foto a mano.
	img: z.string().optional().default(''),
	description: z.string().optional().default(''),
	type: z.string().min(1),
	variant: z.string().optional().default(''),
	count: z.coerce.number().int(),
	active: z.boolean().optional().default(true),
	priceCents: z.coerce.number().int(),
	eventId: z.number().int(),
	// Solo tiene efecto en tenants CHURCH — ver children.ts/public.ts, que buscan el producto
	// isMealOfTheDay del evento para descontar stock al registrar la comida de un hijo.
	isMealOfTheDay: z.boolean().optional().default(false),
});

// Un evento tiene como mucho UNA comida del día — children.ts/public.ts hacen findFirst sobre este
// flag, así que dos productos marcados a la vez dejarían el segundo invisible para esa lógica sin
// ningún aviso. Se desmarca cualquier otro producto del mismo evento en la misma operación.
async function unmarkOtherMealsOfTheDay(tenantId: number, eventId: number, exceptProductId?: number) {
	await prisma.product.updateMany({
		where: { eventId, tenantId, isMealOfTheDay: true, ...(exceptProductId ? { id: { not: exceptProductId } } : {}) },
		data: { isMealOfTheDay: false },
	});
}

productsRouter.get('/', asyncHandler(async (req: AuthenticatedRequest, res) => {
	const tenantId = req.user!.tenantId!;
	const eventId = req.query.eventId ? Number(req.query.eventId) : undefined;
	const products = await prisma.product.findMany({ where: eventId ? { eventId, tenantId } : { tenantId }, orderBy: { id: 'asc' } });
	res.json(products);
}));

productsRouter.get('/:id', asyncHandler(async (req: AuthenticatedRequest, res) => {
	const id = Number(req.params.id);
	const tenantId = req.user!.tenantId!;
	const product = await prisma.product.findUnique({ where: { id, tenantId } });
	if (!product) {
		res.status(404).json({ error: 'Producto no encontrado' });
		return;
	}
	res.json(product);
}));

productsRouter.post('/', asyncHandler(async (req: AuthenticatedRequest, res) => {
	const parsed = productInputSchema.safeParse(req.body);
	if (!parsed.success) {
		res.status(400).json({ error: parsed.error.flatten() });
		return;
	}

	const tenantId = req.user!.tenantId!;
	try {
		// El código identifica el producto (ej. para entrega/canje) — se genera siempre server-side
		// a partir del id (único por diseño) para que no puedan colisionar dos productos distintos.
		const created = await prisma.product.create({ data: { ...parsed.data, code: '', tenantId } });
		const product = await prisma.product.update({
			where: { id: created.id, tenantId },
			data: { code: `PRD-${String(created.id).padStart(4, '0')}` },
		});
		if (parsed.data.isMealOfTheDay) {
			await unmarkOtherMealsOfTheDay(tenantId, parsed.data.eventId, product.id);
		}
		await logAudit({ tenantId, userId: req.user!.userId, action: 'CREATE', entity: 'Product', entityId: product.id, summary: `Creó el producto "${product.name}"` });
		res.status(201).json(product);
	} catch (err: any) {
		if (err.code === 'P2003') {
			res.status(400).json({ error: 'El evento indicado no existe' });
			return;
		}
		throw err;
	}
}));

const bulkImportSchema = z.object({
	eventId: z.number().int(),
	rows: z
		.array(
			z.object({
				name: z.string().min(1),
				description: z.string().optional().default(''),
				type: z.string().optional().default(''),
				variant: z.string().optional().default(''),
				count: z.coerce.number().int().optional().default(0),
				priceCents: z.coerce.number().int().optional().default(0),
				img: z.string().optional().default(''),
			}),
		)
		.min(1)
		.max(500),
});

// Carga masiva desde un CSV/Excel del catálogo de un evento — a diferencia del POST normal, procesa
// cada fila en su propio try/catch (no una sola transacción) para que una fila con datos malos no
// tumbe todo el lote: el usuario sube un archivo real con errores humanos y necesita un reporte de
// qué entró y qué no, no un 400 genérico que descarta todo.
productsRouter.post('/bulk-import', asyncHandler(async (req: AuthenticatedRequest, res) => {
	const tenantId = req.user!.tenantId!;
	const parsed = bulkImportSchema.safeParse(req.body);
	if (!parsed.success) {
		res.status(400).json({ error: parsed.error.flatten() });
		return;
	}
	const { eventId, rows } = parsed.data;

	const event = await prisma.event.findUnique({ where: { id: eventId, tenantId } });
	if (!event) {
		res.status(404).json({ error: 'Evento no encontrado' });
		return;
	}

	let created = 0;
	const skipped: { row: number; reason: string }[] = [];

	for (const [i, row] of rows.entries()) {
		try {
			const product = await prisma.product.create({
				data: {
					name: row.name,
					description: row.description,
					type: row.type,
					variant: row.variant,
					count: row.count,
					priceCents: row.priceCents,
					img: row.img,
					active: true,
					eventId,
					code: '',
					tenantId,
				},
			});
			await prisma.product.update({ where: { id: product.id, tenantId }, data: { code: `PRD-${String(product.id).padStart(4, '0')}` } });
			created++;
		} catch {
			skipped.push({ row: i + 1, reason: `No se pudo crear "${row.name}"` });
		}
	}

	res.json({ created, skipped });
}));

productsRouter.put('/:id', asyncHandler(async (req: AuthenticatedRequest, res) => {
	const id = Number(req.params.id);
	const tenantId = req.user!.tenantId!;
	const parsed = productInputSchema.partial().safeParse(req.body);
	if (!parsed.success) {
		res.status(400).json({ error: parsed.error.flatten() });
		return;
	}

	try {
		const product = await prisma.product.update({ where: { id, tenantId }, data: parsed.data });
		if (parsed.data.isMealOfTheDay) {
			await unmarkOtherMealsOfTheDay(tenantId, product.eventId, product.id);
		}
		await logAudit({ tenantId, userId: req.user!.userId, action: 'UPDATE', entity: 'Product', entityId: product.id, summary: `Editó el producto "${product.name}"` });
		res.json(product);
	} catch (err: any) {
		if (err.code === 'P2025') {
			res.status(404).json({ error: 'Producto no encontrado' });
			return;
		}
		throw err;
	}
}));

productsRouter.delete('/:id', asyncHandler(async (req: AuthenticatedRequest, res) => {
	const id = Number(req.params.id);
	const tenantId = req.user!.tenantId!;

	const soldCount = await prisma.saleProduct.count({ where: { productId: id, tenantId } });
	if (soldCount > 0) {
		res.status(409).json({ error: `No se puede borrar: hay ${soldCount} venta(s) hechas con este producto.` });
		return;
	}

	try {
		const product = await prisma.product.delete({ where: { id, tenantId } });
		await logAudit({ tenantId, userId: req.user!.userId, action: 'DELETE', entity: 'Product', entityId: id, summary: `Borró el producto "${product.name}"` });
		res.status(204).send();
	} catch (err: any) {
		if (err.code === 'P2025') {
			res.status(404).json({ error: 'Producto no encontrado' });
			return;
		}
		throw err;
	}
}));
