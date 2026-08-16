import { prismaUnscoped } from './prisma';
import { computeTenantReportStats } from './report-aggregation';
import { sendPeriodicReport } from './mail';

const FREQUENCY_KEY = 'reports.frequency'; // 'MONTHLY' | 'QUARTERLY'
const DAY_OF_MONTH_KEY = 'reports.dayOfMonth';
const RECIPIENTS_KEY = 'reports.recipients';
const LAST_SENT_AT_KEY = 'reports.lastSentAt'; // solo-backend, no expuesta en el form de Settings

const QUARTER_START_MONTHS = [0, 3, 6, 9];
const RD_TIME_ZONE = 'America/Santo_Domingo';

// Partes de fecha en hora RD (UTC-4 fijo, sin horario de verano) a partir de un instante real —
// antes esta función (y todo lo que dependía de ella) usaba los getters locales de Date, que en
// Railway corren en UTC: los límites de mes/trimestre quedaban desfasados 4hs contra el calendario
// RD real, así que una venta hecha entre las 20:00 y medianoche del último día del mes (hora RD)
// se contaba en el mes siguiente. month acá es 0-indexado, igual que Date.prototype.getMonth.
function getRDDateParts(date: Date): { year: number; month: number; day: number } {
	const parts = new Intl.DateTimeFormat('en-US', { timeZone: RD_TIME_ZONE, year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(date);
	const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
	return { year: get('year'), month: get('month') - 1, day: get('day') };
}

// Instante UTC correspondiente a la medianoche RD de esa fecha calendario (RD = UTC-4 todo el año).
function rdMidnightUTC(year: number, month: number, day: number): Date {
	return new Date(Date.UTC(year, month, day, 4, 0, 0));
}

function todayKeyRD(now: Date): string {
	const { year, month, day } = getRDDateParts(now);
	return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function monthLabel(month: number, year: number): string {
	const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
	return `${months[month]} ${year}`;
}

function quarterLabel(quarterStartMonth: number, year: number): string {
	const quarterNumber = quarterStartMonth / 3 + 1;
	return `T${quarterNumber} ${year}`;
}

// Rango del período recién cerrado según la frecuencia elegida, relativo a "hoy" en calendario RD
// — ej. si hoy es cualquier día de agosto (hora RD) y la frecuencia es MONTHLY, el período cerrado
// es julio completo. Los límites se calculan como instantes UTC de medianoche RD, no medianoche
// del proceso, para no perder/duplicar ventas hechas cerca del cambio de mes.
function resolveClosedPeriod(frequency: string, todayRD: { year: number; month: number }): { dateFrom: Date; dateTo: Date; label: string } | null {
	if (frequency === 'MONTHLY') {
		const dateTo = rdMidnightUTC(todayRD.year, todayRD.month, 1);
		const dateFrom = rdMidnightUTC(todayRD.year, todayRD.month - 1, 1);
		return { dateFrom, dateTo, label: monthLabel(dateFrom.getUTCMonth(), dateFrom.getUTCFullYear()) };
	}
	if (frequency === 'QUARTERLY') {
		const currentQuarterStart = QUARTER_START_MONTHS.filter((m) => m <= todayRD.month).pop() ?? 0;
		const dateTo = rdMidnightUTC(todayRD.year, currentQuarterStart, 1);
		const dateFrom = rdMidnightUTC(todayRD.year, currentQuarterStart - 3, 1);
		return { dateFrom, dateTo, label: quarterLabel(dateFrom.getUTCMonth(), dateFrom.getUTCFullYear()) };
	}
	return null;
}

function shouldSendToday(frequency: string, dayOfMonth: number, todayRD: { month: number; day: number }): boolean {
	if (todayRD.day !== dayOfMonth) return false;
	if (frequency === 'QUARTERLY') return QUARTER_START_MONTHS.includes(todayRD.month);
	return frequency === 'MONTHLY';
}

// Corre a diario (ver cron.schedule en server.ts) y decide por tenant si hoy toca mandar su
// reporte — primer sweep cross-tenant sobre AppSetting del proyecto: todo el resto de accesos a
// esa tabla está scoped por tenantId vía el JWT de una request autenticada, pero acá no hay
// request ni usuario mirando, así que se usa prismaUnscoped a propósito.
export async function runScheduledReportsCheck(): Promise<void> {
	const now = new Date();
	const configuredTenants = await prismaUnscoped.appSetting.findMany({ where: { key: FREQUENCY_KEY } });

	for (const config of configuredTenants) {
		try {
			await processTenantReport(config.tenantId, config.value, now);
		} catch (err) {
			console.error(`[scheduled-reports] Falló el reporte del tenant ${config.tenantId}:`, err);
		}
	}
}

async function processTenantReport(tenantId: number, frequency: string, now: Date): Promise<void> {
	const [dayOfMonthSetting, recipientsSetting, lastSentAtSetting, tenant] = await Promise.all([
		prismaUnscoped.appSetting.findUnique({ where: { tenantId_key: { tenantId, key: DAY_OF_MONTH_KEY } } }),
		prismaUnscoped.appSetting.findUnique({ where: { tenantId_key: { tenantId, key: RECIPIENTS_KEY } } }),
		prismaUnscoped.appSetting.findUnique({ where: { tenantId_key: { tenantId, key: LAST_SENT_AT_KEY } } }),
		prismaUnscoped.tenant.findUnique({ where: { id: tenantId } }),
	]);

	const dayOfMonth = Number(dayOfMonthSetting?.value);
	const recipients = (recipientsSetting?.value ?? '')
		.split(',')
		.map((email) => email.trim())
		.filter(Boolean);

	if (!tenant || !Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 28 || recipients.length === 0) return;

	const todayRD = getRDDateParts(now);
	if (!shouldSendToday(frequency, dayOfMonth, todayRD)) return;
	if (lastSentAtSetting?.value === todayKeyRD(now)) return; // ya se mandó hoy (ej. proceso reiniciado)

	const period = resolveClosedPeriod(frequency, todayRD);
	if (!period) return;

	const stats = await computeTenantReportStats(tenantId, period.dateFrom, period.dateTo);
	await sendPeriodicReport({ to: recipients, tenantName: tenant.name, periodLabel: period.label, stats });

	await prismaUnscoped.appSetting.upsert({
		where: { tenantId_key: { tenantId, key: LAST_SENT_AT_KEY } },
		update: { value: todayKeyRD(now) },
		create: { tenantId, key: LAST_SENT_AT_KEY, value: todayKeyRD(now) },
	});
}
