import crypto from 'node:crypto';
import { prisma } from './prisma';

// Credenciales de WhatsApp Cloud API por tenant, guardadas en AppSetting (mismo namespace/patrón
// que "payments.*" en lib/paypal.ts). accessTokenSecret, verifyTokenSecret y appSecretSecret nunca
// salen por GET /settings (ver el filtro de keys "*Secret" en settings.ts).
const WHATSAPP_KEYS = [
	'whatsapp.phoneNumberId',
	'whatsapp.accessTokenSecret',
	'whatsapp.verifyTokenSecret',
	'whatsapp.appSecretSecret',
	'whatsapp.allowedSenders',
	'whatsapp.publishDelayHours',
] as const;

// Default histórico (ver el comentario original en routes/public.ts) — un tenant que nunca tocó
// este campo nuevo sigue viendo exactamente el mismo comportamiento de siempre, sin sorpresas.
const DEFAULT_PUBLISH_DELAY_HOURS = 24;

const GRAPH_BASE = 'https://graph.facebook.com/v21.0';

export class WhatsAppNotConfiguredError extends Error {}
export class WhatsAppRequestError extends Error {}

type WhatsAppConfig = {
	phoneNumberId: string;
	accessToken: string;
	verifyToken: string | null;
	appSecret: string | null;
	// Números en formato WhatsApp (solo dígitos, con código de país, ej. "18095551234") autorizados a
	// crear eventos por esta vía — cualquier otro remitente se ignora, así el webhook no queda abierto
	// para que cualquiera con el número de WhatsApp del club le mande un evento falso.
	allowedSenders: string[];
	// Horas de margen antes de que un evento creado por esta vía quede visible/comprable (ver
	// Event.publishAt en routes/public.ts) — le da tiempo al encargado de revisar lo que la IA leyó
	// del flyer antes de que el público pueda comprar. 0 = publicar de inmediato, sin ventana.
	publishDelayHours: number;
};

export async function getTenantConfig(tenantId: number): Promise<WhatsAppConfig> {
	const rows = await prisma.appSetting.findMany({ where: { tenantId, key: { in: [...WHATSAPP_KEYS] } } });
	const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
	const phoneNumberId = map['whatsapp.phoneNumberId'];
	const accessToken = map['whatsapp.accessTokenSecret'];
	if (!phoneNumberId || !accessToken) {
		throw new WhatsAppNotConfiguredError('Este club todavía no configuró WhatsApp (Settings → WhatsApp).');
	}
	return {
		phoneNumberId,
		accessToken,
		verifyToken: map['whatsapp.verifyTokenSecret'] ?? null,
		appSecret: map['whatsapp.appSecretSecret'] ?? null,
		// Solo dígitos — así "+1 809-627-9180" matchea igual que "18096279180" contra el remitente que
		// manda Meta (que siempre llega sin símbolos), sin que un formato distinto rechace en silencio
		// un número que en realidad sí estaba autorizado.
		allowedSenders: (map['whatsapp.allowedSenders'] ?? '')
			.split(',')
			.map((s) => s.replace(/\D/g, ''))
			.filter(Boolean),
		publishDelayHours: parsePublishDelayHours(map['whatsapp.publishDelayHours']),
	};
}

function parsePublishDelayHours(raw: string | undefined): number {
	if (raw == null || raw.trim() === '') return DEFAULT_PUBLISH_DELAY_HOURS;
	const hours = Number(raw);
	if (!Number.isFinite(hours) || hours < 0) return DEFAULT_PUBLISH_DELAY_HOURS;
	return hours;
}

// Confirma que el POST del webhook realmente vino de Meta (y no de cualquiera que le pegue a la
// URL) comparando el HMAC-SHA256 del body crudo contra el header X-Hub-Signature-256, usando el App
// Secret de la App de Meta (Configuración básica → App Secret). Requiere el body SIN parsear
// (ver server.ts, que lo captura como rawBody antes de que express.json() lo consuma).
export function verifySignature(rawBody: Buffer, signatureHeader: string | undefined, appSecret: string): boolean {
	if (!signatureHeader?.startsWith('sha256=')) return false;
	const expected = crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
	const provided = signatureHeader.slice('sha256='.length);
	if (expected.length !== provided.length) return false;
	return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
}

// WhatsApp ya limita las imágenes de chat a 5MB de su lado, pero esto es una red de seguridad barata
// contra un media_id que devuelva algo inesperadamente grande — sin esto, un archivo enorme se
// mandaría igual a Claude, gastando tokens/tiempo de más sin necesidad.
const MAX_MEDIA_BYTES = 10 * 1024 * 1024;

// El payload del mensaje solo trae el ID del media, no la imagen — hay que resolverlo en dos pasos:
// 1) pedirle a Graph la URL temporal de descarga, 2) bajar los bytes de esa URL con el mismo token.
export async function downloadMedia(mediaId: string, accessToken: string): Promise<{ buffer: Buffer; mimeType: string }> {
	const metaRes = await fetch(`${GRAPH_BASE}/${mediaId}`, { headers: { Authorization: `Bearer ${accessToken}` } });
	if (!metaRes.ok) {
		throw new WhatsAppRequestError(`No se pudo resolver la URL del media de WhatsApp (${metaRes.status})`);
	}
	const meta = (await metaRes.json()) as { url: string; mime_type: string; file_size?: number };
	if (meta.file_size && meta.file_size > MAX_MEDIA_BYTES) {
		throw new WhatsAppRequestError(`La imagen es demasiado grande (${Math.round(meta.file_size / 1024 / 1024)}MB, máximo 10MB)`);
	}
	const fileRes = await fetch(meta.url, { headers: { Authorization: `Bearer ${accessToken}` } });
	if (!fileRes.ok) {
		throw new WhatsAppRequestError(`No se pudo descargar la imagen de WhatsApp (${fileRes.status})`);
	}
	const buffer = Buffer.from(await fileRes.arrayBuffer());
	if (buffer.length > MAX_MEDIA_BYTES) {
		throw new WhatsAppRequestError(`La imagen es demasiado grande (${Math.round(buffer.length / 1024 / 1024)}MB, máximo 10MB)`);
	}
	return { buffer, mimeType: meta.mime_type };
}

// Confirmación por WhatsApp de vuelta al remitente — es la única "revisión" que tiene este flujo ya
// que el evento se publica directo sin pantalla de aprobación (decisión del club): así se entera al
// toque si la IA leyó mal un precio o una fecha, en vez de descubrirlo cuando ya alguien compró.
export async function sendTextMessage(config: WhatsAppConfig, to: string, body: string): Promise<void> {
	const res = await fetch(`${GRAPH_BASE}/${config.phoneNumberId}/messages`, {
		method: 'POST',
		headers: { Authorization: `Bearer ${config.accessToken}`, 'Content-Type': 'application/json' },
		body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body } }),
	});
	if (!res.ok) {
		console.error('No se pudo responder por WhatsApp:', res.status, await res.text().catch(() => ''));
	}
}
