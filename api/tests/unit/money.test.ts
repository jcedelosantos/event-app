import { describe, expect, it } from 'vitest';
import { centsToDollars, centsToPayPalValue, dollarsToCents, formatUSD } from '../../src/lib/money';

describe('money.ts — fronteras dólares/centavos', () => {
	it('dollarsToCents redondea al centavo más cercano', () => {
		expect(dollarsToCents(49)).toBe(4900);
		expect(dollarsToCents(9.99)).toBe(999);
		// El caso real que motivó esta migración: 0.1 + 0.2 en float no da 0.3 exacto.
		expect(dollarsToCents(0.1 + 0.2)).toBe(30);
	});

	it('centsToDollars es la inversa exacta de dollarsToCents para valores con hasta 2 decimales', () => {
		expect(centsToDollars(4900)).toBe(49);
		expect(centsToDollars(999)).toBe(9.99);
	});

	it('formatUSD siempre muestra 2 decimales, incluso en montos redondos', () => {
		expect(formatUSD(4900)).toBe('USD 49.00');
		expect(formatUSD(999)).toBe('USD 9.99');
		expect(formatUSD(0)).toBe('USD 0.00');
	});

	it('centsToPayPalValue devuelve el string de 2 decimales que PayPal exige', () => {
		expect(centsToPayPalValue(4900)).toBe('49.00');
		expect(centsToPayPalValue(999)).toBe('9.99');
	});

	it('sumar centavos enteros repetidamente no acumula error de punto flotante', () => {
		// Caso concreto que un Float hubiera arrastrado mal: 3 ventas de $0.10 en centavos.
		const sales = [10, 10, 10];
		const total = sales.reduce((sum, c) => sum + c, 0);
		expect(total).toBe(30);
		expect(centsToDollars(total)).toBe(0.3);
	});
});
