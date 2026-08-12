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

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

export const imageUpload = multer({
	storage,
	limits: { fileSize: MAX_UPLOAD_BYTES },
	fileFilter: (_req, file, cb) => {
		if (!file.mimetype.startsWith('image/')) {
			cb(new Error('Solo se permiten imágenes'));
			return;
		}
		cb(null, true);
	},
});

// Cuando el archivo excede `limits.fileSize`, busboy no siempre emite el MulterError tipado
// (`LIMIT_FILE_SIZE`) — a veces corta el stream a mitad de archivo y el parser multipart termina
// tirando el mensaje crudo "Unexpected end of form" (ver https://github.com/expressjs/multer/issues/1104).
// Sin este mapeo, ese mensaje llegaba tal cual al usuario final, indistinguible de un error real.
export function formatUploadError(err: unknown): string {
	if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
		return `La imagen es demasiado grande (máx. ${MAX_UPLOAD_BYTES / (1024 * 1024)}MB).`;
	}
	if (err instanceof Error && err.message === 'Unexpected end of form') {
		return `La imagen es demasiado grande (máx. ${MAX_UPLOAD_BYTES / (1024 * 1024)}MB).`;
	}
	return err instanceof Error ? err.message : 'No se pudo subir la imagen';
}

const EXT_BY_MIME: Record<string, string> = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };

// Mismo destino que imageUpload (multer), pero para guardar un buffer que ya está en memoria (ej. la
// imagen bajada de la API de WhatsApp, ver lib/whatsapp.ts) en vez de un archivo subido por HTTP.
export function saveBuffer(buffer: Buffer, mimeType: string): string {
	const ext = EXT_BY_MIME[mimeType] ?? '.jpg';
	const filename = `${randomUUID()}${ext}`;
	fs.writeFileSync(path.join(uploadsDir, filename), buffer);
	return `/uploads/${filename}`;
}
