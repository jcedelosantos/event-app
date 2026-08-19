import { randomBytes, createHash } from 'node:crypto';

// Mismo mecanismo que el claim token de auto-login (ver routes/signup.ts hashClaimToken): se genera
// con node:crypto (no bcrypt — no hace falta ser lento, la clave ya tiene suficiente entropía) y
// solo se guarda el hash SHA-256. El valor en texto plano (plainKey) se devuelve UNA sola vez al
// crearla (routes/api-keys.ts POST) y nunca se puede reconstruir a partir de lo guardado.
const KEY_PREFIX = 'ik_live_';

export function generateApiKey(): { plainKey: string; keyHash: string; keyPrefix: string } {
	const plainKey = `${KEY_PREFIX}${randomBytes(24).toString('base64url')}`;
	return { plainKey, keyHash: hashApiKey(plainKey), keyPrefix: plainKey.slice(0, KEY_PREFIX.length + 8) };
}

export function hashApiKey(plainKey: string): string {
	return createHash('sha256').update(plainKey).digest('hex');
}
