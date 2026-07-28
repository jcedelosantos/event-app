import path from 'node:path';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import multer from 'multer';

// En producción se sobreescribe (UPLOADS_DIR=/data/uploads, ver Railway) con una ruta dentro del
// volumen persistente — sin esto, cualquier imagen subida se perdería en el próximo deploy, porque
// el resto del filesystem del contenedor es efímero.
export const uploadsDir = process.env.UPLOADS_DIR ?? path.join(__dirname, '../../uploads');
fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
	destination: uploadsDir,
	filename: (_req, file, cb) => {
		const ext = path.extname(file.originalname).toLowerCase();
		cb(null, `${randomUUID()}${ext}`);
	},
});

export const imageUpload = multer({
	storage,
	limits: { fileSize: 5 * 1024 * 1024 },
	fileFilter: (_req, file, cb) => {
		if (!file.mimetype.startsWith('image/')) {
			cb(new Error('Solo se permiten imágenes'));
			return;
		}
		cb(null, true);
	},
});

const EXT_BY_MIME: Record<string, string> = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };

// Mismo destino que imageUpload (multer), pero para guardar un buffer que ya está en memoria (ej. la
// imagen bajada de la API de WhatsApp, ver lib/whatsapp.ts) en vez de un archivo subido por HTTP.
export function saveBuffer(buffer: Buffer, mimeType: string): string {
	const ext = EXT_BY_MIME[mimeType] ?? '.jpg';
	const filename = `${randomUUID()}${ext}`;
	fs.writeFileSync(path.join(uploadsDir, filename), buffer);
	return `/uploads/${filename}`;
}
