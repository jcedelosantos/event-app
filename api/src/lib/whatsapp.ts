import crypto from 'node:crypto';
import { prisma } from './prisma';

// Credenciales de WhatsApp Cloud API por tenant, guardadas en AppSetting (mismo namespace/patrón
// que "payments.*" en lib/paypal.ts). accessTokenSecret, verifyTokenSecret y appSecretSecret nunca
// salen por GET /settings (ver el filtro de keys "*Secret" en settings.ts).
const WHATSAPP_KEYS = ['whatsapp.phoneNumberId', 'whatsapp.accessTokenSecret', 'whatsapp.verifyTokenSecret', 'whatsapp.appSecretSecret', 'whatsapp.allowedSenders'] as const;

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
		allowedSenders: (map['whatsapp.allowedSenders'] ?? '')
			.split(',')
			.map((s) => s.trim())
			.filter(Boolean),
	};
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

// El payload del mensaje solo trae el ID del media, no la imagen — hay que resolverlo en dos pasos:
// 1) pedirle a Graph la URL temporal de descarga, 2) bajar los bytes de esa URL con el mismo token.
export async function downloadMedia(mediaId: string, accessToken: string): Promise<{ buffer: Buffer; mimeType: string }> {
	const metaRes = await fetch(`${GRAPH_BASE}/${mediaId}`, { headers: { Authorization: `Bearer ${accessToken}` } });
	if (!metaRes.ok) {
		throw new WhatsAppRequestError(`No se pudo resolver la URL del media de WhatsApp (${metaRes.status})`);
	}
	const meta = (await metaRes.json()) as { url: string; mime_type: string };
	const fileRes = await fetch(meta.url, { headers: { Authorization: `Bearer ${accessToken}` } });
	if (!fileRes.ok) {
		throw new WhatsAppRequestError(`No se pudo descargar la imagen de WhatsApp (${fileRes.status})`);
	}
	const buffer = Buffer.from(await fileRes.arrayBuffer());
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
