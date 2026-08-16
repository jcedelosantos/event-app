// Toda plata en este backend se guarda y se opera en centavos enteros (Int), nunca en dólares
// float — sumar/restar/multiplicar floats de dinero acumula error de redondeo (0.1 + 0.2 !== 0.3
// en IEEE-754) que con suficientes ventas termina en un total de factura o de reporte que no
// cuadra al centavo. Los enteros hasta 2^53 son exactos en JS, así que centavos enteros no tienen
// ese problema. Estas son las únicas dos fronteras donde de verdad hace falta convertir: al recibir
// un monto en dólares desde afuera (ej. un formulario que todavía muestra "$49.00") y al mandar un
// monto a una API externa que sí espera dólares con 2 decimales (PayPal).

export function dollarsToCents(dollars: number): number {
	return Math.round(dollars * 100);
}

export function centsToDollars(cents: number): number {
	return cents / 100;
}

// Formato para PDF/email (texto plano, ej. "USD 49.00") — nunca para JSON de API, que viaja en
// centavos enteros y lo formatea el frontend.
export function formatUSD(cents: number): string {
	return `USD ${centsToDollars(cents).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// PayPal (`/v2/checkout/orders`, `/v1/billing/*`) exige el monto como string con 2 decimales,
// nunca centavos — única frontera de salida hacia una API externa que sigue en dólares.
export function centsToPayPalValue(cents: number): string {
	return centsToDollars(cents).toFixed(2);
}
