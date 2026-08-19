export interface ApiKey {
	id: number;
	name: string;
	keyPrefix: string;
	active: boolean;
	createdAt: string;
	lastUsedAt: string | null;
	revokedAt: string | null;
}

// Solo existe en la respuesta de POST /api-keys — nunca se vuelve a ver el valor en texto plano
// después de este momento (ver ApiKey.keyHash en la API).
export interface CreatedApiKey {
	id: number;
	name: string;
	keyPrefix: string;
	createdAt: string;
	key: string;
}
