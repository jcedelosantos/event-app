import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../lib/async-handler';

export const productsRouter = Router();
productsRouter.use(requireAuth);

const productInputSchema = z.object({
	name: z.string().min(1),
	img: z.string().optional().default(''),
	description: z.string().optional().default(''),
	type: z.string().min(1),
	variant: z.string().optional().default(''),
	count: z.coerce.number().int(),
	active: z.boolean().optional().default(true),
	price: z.coerce.number(),
	eventId: z.number().int(),
});

productsRouter.get('/', asyncHandler(async (req, res) => {
	const eventId = req.query.eventId ? Number(req.query.eventId) : undefined;
	const products = await prisma.product.findMany({ where: eventId ? { eventId } : undefined, orderBy: { id: 'asc' } });
	res.json(products);
}));

productsRouter.get('/:id', asyncHandler(async (req, res) => {
	const id = Number(req.params.id);
	const product = await prisma.product.findUnique({ where: { id } });
	if (!product) {
		res.status(404).json({ error: 'Producto no encontrado' });
		return;
	}
	res.json(product);
}));

productsRouter.post('/', asyncHandler(async (req, res) => {
	const parsed = productInputSchema.safeParse(req.body);
	if (!parsed.success) {
		res.status(400).json({ error: parsed.error.flatten() });
		return;
	}

	try {
		// El código identifica el producto (ej. para entrega/canje) — se genera siempre server-side
		// a partir del id (único por diseño) para que no puedan colisionar dos productos distintos.
		const created = await prisma.product.create({ data: { ...parsed.data, code: '' } });
		const product = await prisma.product.update({
			where: { id: created.id },
			data: { code: `PRD-${String(created.id).padStart(4, '0')}` },
		});
		res.status(201).json(product);
	} catch (err: any) {
		if (err.code === 'P2003') {
			res.status(400).json({ error: 'El evento indicado no existe' });
			return;
		}
		throw err;
	}
}));

productsRouter.put('/:id', asyncHandler(async (req, res) => {
	const id = Number(req.params.id);
	const parsed = productInputSchema.partial().safeParse(req.body);
	if (!parsed.success) {
		res.status(400).json({ error: parsed.error.flatten() });
		return;
	}

	try {
		const product = await prisma.product.update({ where: { id }, data: parsed.data });
		res.json(product);
	} catch (err: any) {
		if (err.code === 'P2025') {
			res.status(404).json({ error: 'Producto no encontrado' });
			return;
		}
		throw err;
	}
}));

productsRouter.delete('/:id', asyncHandler(async (req, res) => {
	const id = Number(req.params.id);

	const soldCount = await prisma.saleProduct.count({ where: { productId: id } });
	if (soldCount > 0) {
		res.status(409).json({ error: `No se puede borrar: hay ${soldCount} venta(s) hechas con este producto.` });
		return;
	}

	try {
		await prisma.product.delete({ where: { id } });
		res.status(204).send();
	} catch (err: any) {
		if (err.code === 'P2025') {
			res.status(404).json({ error: 'Producto no encontrado' });
			return;
		}
		throw err;
	}
}));
