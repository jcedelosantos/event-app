// Toda plata que viaja desde la API llega en centavos enteros (ver api/src/lib/money.ts) — esta es
// la única frontera de conversión, justo antes de mostrarla. Nunca hacer aritmética de plata acá
// en dólares float; sumar/restar siempre en centavos y convertir recién al final, al mostrar.

export function centsToDollars(cents: number): number {
	return cents / 100;
}

export function dollarsToCents(dollars: number): number {
	return Math.round(dollars * 100);
}

// Cotización en pesos dominicanos junto al monto en USD, para el picker público (ver
// Settings → Pagos → "Tasa del día" y public-event.component.ts) — sin tasa configurada, se
// muestra solo USD (comportamiento previo a este campo, ningún tenant queda bloqueado por no
// haberla cargado).
export function formatDualCurrency(cents: number, exchangeRateRD: number | null): string {
	const usd = centsToDollars(cents).toFixed(2);
	if (!exchangeRateRD) return `${usd} USD`;
	const rd = (centsToDollars(cents) * exchangeRateRD).toFixed(2);
	return `${usd} USD (RD$${rd})`;
}
