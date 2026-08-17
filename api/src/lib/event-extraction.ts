import { z } from 'zod';

// Lee un flyer de evento con IA con visión (Claude, vía fetch directo a la Messages API — sin SDK,
// mismo estilo que lib/paypal.ts) y devuelve los mismos campos que se cargaron a mano para los
// eventos de prueba de esta sesión (nombre, descripción, tickets, fecha, hora, mapa sugerido).
// Requiere ANTHROPIC_API_KEY como variable de entorno del backend (no es un secreto por tenant — es
// costo operativo de la plataforma, igual que RESEND_API_KEY en lib/mail.ts).

export class AnthropicNotConfiguredError extends Error {}
export class AnthropicRequestError extends Error {}

const extractedTicketSchema = z.object({
	name: z.string(),
	price: z.number().min(0),
	count: z.number().int().min(1),
	attendeeType: z.enum(['SOCIO', 'INVITADO']).nullable(),
});

export const extractedEventSchema = z.object({
	name: z.string(),
	description: z.string(),
	dateOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
	dateOff: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
	startTime: z
		.string()
		.regex(/^\d{2}:\d{2}$/)
		.nullable(),
	// Nombre del salón/lugar tal como aparece en el flyer (o null si no lo menciona) — se resuelve
	// contra los mapas reales del tenant en public.ts, la IA nunca inventa un mapId.
	venueNameGuess: z.string().nullable(),
	tickets: z.array(extractedTicketSchema).min(1),
});

export type ExtractedEvent = z.infer<typeof extractedEventSchema>;

const EXTRACT_TOOL = {
	name: 'extract_event',
	description: 'Extrae los datos de un evento a partir de la imagen de un flyer/afiche promocional.',
	input_schema: {
		type: 'object' as const,
		properties: {
			name: { type: 'string', description: 'Nombre del evento tal como aparece en el flyer.' },
			description: { type: 'string', description: 'Descripción breve (artista invitado, banda, qué incluye, etc.) basada solo en texto visible del flyer.' },
			dateOn: { type: 'string', description: 'Fecha de inicio en formato YYYY-MM-DD.' },
			dateOff: { type: 'string', description: 'Fecha de fin en formato YYYY-MM-DD (igual a dateOn si es de un solo día).' },
			startTime: { type: ['string', 'null'], description: 'Hora de inicio en formato HH:MM 24hs, o null si no aparece.' },
			venueNameGuess: { type: ['string', 'null'], description: 'Nombre del salón/lugar mencionado en el flyer, o null si no lo dice.' },
			tickets: {
				type: 'array',
				minItems: 1,
				items: {
					type: 'object',
					properties: {
						name: { type: 'string' },
						price: { type: 'number', minimum: 0 },
						count: { type: 'integer', minimum: 1, description: 'Cupo estimado para este tipo de ticket.' },
						attendeeType: { type: ['string', 'null'], enum: ['SOCIO', 'INVITADO', null] },
					},
					required: ['name', 'price', 'count', 'attendeeType'],
				},
			},
		},
		required: ['name', 'description', 'dateOn', 'dateOff', 'startTime', 'venueNameGuess', 'tickets'],
	},
};

export async function extractEventFromImage(imageBuffer: Buffer, mimeType: string, existingMapNames: string[]): Promise<ExtractedEvent> {
	const apiKey = process.env.ANTHROPIC_API_KEY;
	if (!apiKey) {
		throw new AnthropicNotConfiguredError('ANTHROPIC_API_KEY no está configurada en el servidor.');
	}

	const today = new Date().toISOString().slice(0, 10);
	const prompt = [
		`Hoy es ${today}. Extraé los datos de este flyer de evento para cargarlo en un sistema de venta de tickets.`,
		'',
		'Reglas para completar datos que el flyer no da explícitamente:',
		'- Si el flyer no dice el año, asumí la próxima fecha futura que coincida con ese día y mes (si ya pasó este año, es el año que viene).',
		'- Si da un aforo/capacidad total pero no el desglose por tipo de ticket, repartilo en partes iguales entre los tipos de ticket que sí menciona.',
		'- Si no da ningún número de aforo, usa 300 como cupo por defecto para cada tipo de ticket.',
		'- "No cover" o "gratis" significa price: 0.',
		`- Mapas/salones ya existentes en este club (para venueNameGuess, elige el que mejor coincida con lo que dice el flyer, o null si ninguno aplica): ${existingMapNames.join(', ') || '(ninguno registrado)'}`,
		'- No inventes artistas, nombres de personas ni datos que no estén escritos en el flyer.',
	].join('\n');

	const res = await fetch('https://api.anthropic.com/v1/messages', {
		method: 'POST',
		headers: {
			'x-api-key': apiKey,
			'anthropic-version': '2023-06-01',
			'content-type': 'application/json',
		},
		body: JSON.stringify({
			model: 'claude-sonnet-5',
			max_tokens: 1024,
			tools: [EXTRACT_TOOL],
			tool_choice: { type: 'tool', name: 'extract_event' },
			messages: [
				{
					role: 'user',
					content: [
						{ type: 'image', source: { type: 'base64', media_type: mimeType, data: imageBuffer.toString('base64') } },
						{ type: 'text', text: prompt },
					],
				},
			],
		}),
	});

	if (!res.ok) {
		throw new AnthropicRequestError(`No se pudo leer la imagen con IA (${res.status}): ${await res.text()}`);
	}

	const data = (await res.json()) as { content: { type: string; input?: unknown }[] };
	const toolUse = data.content.find((block) => block.type === 'tool_use');
	if (!toolUse) {
		throw new AnthropicRequestError('La IA no devolvió los datos extraídos en el formato esperado.');
	}

	const parsed = extractedEventSchema.safeParse(toolUse.input);
	if (!parsed.success) {
		throw new AnthropicRequestError(`Datos extraídos con formato inválido: ${JSON.stringify(parsed.error.flatten())}`);
	}
	return parsed.data;
}
