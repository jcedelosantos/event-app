import { Router } from 'express';
import { requireAuth, requireTenant } from '../middleware/auth';
import { imageUpload } from '../lib/uploads';

export const uploadsRouter = Router();
uploadsRouter.use(requireAuth, requireTenant);

uploadsRouter.post('/', (req, res) => {
	imageUpload.single('file')(req, res, (err: unknown) => {
		if (err) {
			res.status(400).json({ error: err instanceof Error ? err.message : 'No se pudo subir la imagen' });
			return;
		}
		if (!req.file) {
			res.status(400).json({ error: 'No se recibió ningún archivo' });
			return;
		}
		res.status(201).json({ url: `/uploads/${req.file.filename}` });
	});
});
