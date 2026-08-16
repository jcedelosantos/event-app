// Toda plata que viaja desde la API llega en centavos enteros (ver api/src/lib/money.ts) — esta es
// la única frontera de conversión, justo antes de mostrarla. Nunca hacer aritmética de plata acá
// en dólares float; sumar/restar siempre en centavos y convertir recién al final, al mostrar.

export function centsToDollars(cents: number): number {
	return cents / 100;
}

export function dollarsToCents(dollars: number): number {
	return Math.round(dollars * 100);
}
