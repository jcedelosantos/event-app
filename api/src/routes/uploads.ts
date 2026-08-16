import { Router } from 'express';
import { requireAuth, requireTenant, blockScannerRole } from '../middleware/auth';
import { requireActiveSubscription } from '../middleware/plan';
import { formatUploadError, imageUpload } from '../lib/uploads';
import { asyncHandler } from '../lib/async-handler';

export const uploadsRouter = Router();
uploadsRouter.use(requireAuth, requireTenant, blockScannerRole, requireActiveSubscription);

// Único endpoint de la API que no pasaba por asyncHandler (multer usa un callback, no una promesa) —
// hoy es inofensivo porque no hay ningún `await` antes de responder, pero se envuelve igual para que
// una futura edición que agregue un paso async acá no reintroduzca el crash de proceso completo que
// ya pasó una vez en esta app (ver lib/async-handler.ts).
uploadsRouter.post(
	'/',
	asyncHandler((req, res) => {
		return new Promise<void>((resolve, reject) => {
			imageUpload.single('file')(req, res, (err: unknown) => {
				if (err) {
					res.status(400).json({ error: formatUploadError(err) });
					resolve();
					return;
				}
				if (!req.file) {
					res.status(400).json({ error: 'No se recibió ningún archivo' });
					resolve();
					return;
				}
				res.status(201).json({ url: `/uploads/${req.file.filename}` });
				resolve();
			});
		});
	}),
);
