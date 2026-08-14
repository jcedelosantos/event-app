import { promises as dns } from 'node:dns';

// Zod's .email() solo valida el FORMATO (tiene @, estructura válida) — no detecta un dominio
// inventado o mal tipeado (ej. "gmial.com"). Un lookup MX es la forma más barata y rápida de
// confirmar que el dominio existe y está configurado para recibir correo, sin depender de ningún
// servicio de terceros ni mandar nada. No garantiza que la CASILLA puntual exista (eso requeriría
// mandar un correo real y esperar un click, fuera de alcance de esta vuelta) — solo que el
// dominio no es un typo evidente.
export async function hasValidMxRecord(email: string): Promise<boolean> {
	const domain = email.split('@')[1];
	if (!domain) return false;
	try {
		const records = await dns.resolveMx(domain);
		return records.length > 0;
	} catch {
		return false;
	}
}
