// Datos del emisor (la agencia — Cedanet Solutions) y la secuencia de NCF para las facturas de
// suscripción/overage (ver lib/invoice-pdf.ts) — vive en PlatformSetting (ver schema.prisma) por el
// mismo motivo que las credenciales de PayPal Billing en lib/paypal-billing.ts: es configuración
// genuinamente global, sin tenantId, que el Super Admin carga una vez desde el panel.
import { prisma } from './prisma';

export type InvoiceIssuerConfig = {
	name: string;
	rnc: string;
	email: string;
	phone: string;
	address: string;
	bankName: string;
	bankAccountType: string;
	bankAccountNumber: string;
	bankAccountHolder: string;
};

export const INVOICE_SETTING_KEYS = [
	'invoiceIssuerName',
	'invoiceIssuerRnc',
	'invoiceIssuerEmail',
	'invoiceIssuerPhone',
	'invoiceIssuerAddress',
	'invoiceBankName',
	'invoiceBankAccountType',
	'invoiceBankAccountNumber',
	'invoiceBankAccountHolder',
	'invoiceNcfPrefix',
	'invoiceNcfNext',
] as const;

export type InvoiceSettingKey = (typeof INVOICE_SETTING_KEYS)[number];

export async function getInvoiceIssuerConfig(): Promise<InvoiceIssuerConfig> {
	const rows = await prisma.platformSetting.findMany({ where: { key: { in: [...INVOICE_SETTING_KEYS] } } });
	const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
	return {
		name: map.invoiceIssuerName ?? '',
		rnc: map.invoiceIssuerRnc ?? '',
		email: map.invoiceIssuerEmail ?? '',
		phone: map.invoiceIssuerPhone ?? '',
		address: map.invoiceIssuerAddress ?? '',
		bankName: map.invoiceBankName ?? '',
		bankAccountType: map.invoiceBankAccountType ?? '',
		bankAccountNumber: map.invoiceBankAccountNumber ?? '',
		bankAccountHolder: map.invoiceBankAccountHolder ?? '',
	};
}

// Consume y avanza el próximo NCF de forma atómica: dos facturas generadas en paralelo (dos
// pestañas del Super Admin, por ejemplo) nunca pueden terminar con el mismo número — la lectura y
// el incremento van en la misma transacción. Devuelve null si todavía no se configuró un rango
// (invoiceNcfNext sin valor numérico) — la factura sigue funcionando, solo sin NCF fiscal.
export async function nextNcf(): Promise<string | null> {
	return prisma.$transaction(async (tx) => {
		const [prefixRow, nextRow] = await Promise.all([
			tx.platformSetting.findUnique({ where: { key: 'invoiceNcfPrefix' } }),
			tx.platformSetting.findUnique({ where: { key: 'invoiceNcfNext' } }),
		]);
		if (!nextRow) return null;
		const current = Number.parseInt(nextRow.value, 10);
		if (!Number.isFinite(current) || current < 0) return null;
		const prefix = prefixRow?.value?.trim() || 'B01';
		await tx.platformSetting.update({ where: { key: 'invoiceNcfNext' }, data: { value: String(current + 1) } });
		return `${prefix}${String(current).padStart(8, '0')}`;
	});
}
