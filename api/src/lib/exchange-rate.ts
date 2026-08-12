// Tasa de cambio USD→DOP para mostrarle al cliente el equivalente en pesos del monto a transferir
// (ver signup-event.ts /bank-info) — sin cuenta ni API key propia, se usa open.er-api.com (gratis,
// sin auth, sin límite de uso conocido). Cacheada en memoria: no tiene sentido pedirla en cada carga
// de la página de checkout, y si el proveedor falla el checkout sigue funcionando sin el equivalente
// en pesos (best-effort, igual criterio que el resto de integraciones opcionales de esta app).
let cachedRate: { value: number; fetchedAt: number } | null = null;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

export async function getUsdToDopRate(): Promise<number | null> {
	if (cachedRate && Date.now() - cachedRate.fetchedAt < CACHE_TTL_MS) {
		return cachedRate.value;
	}
	try {
		const response = await fetch('https://open.er-api.com/v6/latest/USD');
		if (!response.ok) return cachedRate?.value ?? null;
		const data = (await response.json()) as { result?: string; rates?: Record<string, number> };
		const rate = data.result === 'success' ? data.rates?.DOP : undefined;
		if (typeof rate !== 'number' || !Number.isFinite(rate)) return cachedRate?.value ?? null;
		cachedRate = { value: rate, fetchedAt: Date.now() };
		return rate;
	} catch (err) {
		console.error('[exchange-rate] No se pudo obtener la tasa USD/DOP:', err);
		return cachedRate?.value ?? null;
	}
}
