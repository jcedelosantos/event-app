import { prismaUnscoped } from './prisma';
import { computeTenantReportStats } from './report-aggregation';
import { sendPeriodicReport } from './mail';

const FREQUENCY_KEY = 'reports.frequency'; // 'MONTHLY' | 'QUARTERLY'
const DAY_OF_MONTH_KEY = 'reports.dayOfMonth';
const RECIPIENTS_KEY = 'reports.recipients';
const LAST_SENT_AT_KEY = 'reports.lastSentAt'; // solo-backend, no expuesta en el form de Settings

const QUARTER_START_MONTHS = [0, 3, 6, 9];

function todayKeyRD(): string {
	// Mismo criterio que utils/dates.ts en el frontend: dateSold es un timestamp real, no un
	// placeholder de calendario, así que se compara en hora local del proceso (Railway corre en
	// UTC — ver el horario del cron.schedule más abajo, elegido para caer en horario laboral RD).
	const now = new Date();
	return `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
}

function monthLabel(month: number, year: number): string {
	const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
	return `${months[month]} ${year}`;
}

function quarterLabel(quarterStartMonth: number, year: number): string {
	const quarterNumber = quarterStartMonth / 3 + 1;
	return `T${quarterNumber} ${year}`;
}

// Rango del período recién cerrado según la frecuencia elegida, relativo a "hoy" — ej. si hoy es
// cualquier día de agosto y la frecuencia es MONTHLY, el período cerrado es julio completo.
function resolveClosedPeriod(frequency: string, today: Date): { dateFrom: Date; dateTo: Date; label: string } | null {
	if (frequency === 'MONTHLY') {
		const dateTo = new Date(today.getFullYear(), today.getMonth(), 1);
		const dateFrom = new Date(today.getFullYear(), today.getMonth() - 1, 1);
		return { dateFrom, dateTo, label: monthLabel(dateFrom.getMonth(), dateFrom.getFullYear()) };
	}
	if (frequency === 'QUARTERLY') {
		const currentQuarterStart = QUARTER_START_MONTHS.filter((m) => m <= today.getMonth()).pop() ?? 0;
		const dateTo = new Date(today.getFullYear(), currentQuarterStart, 1);
		const dateFrom = new Date(today.getFullYear(), currentQuarterStart - 3, 1);
		return { dateFrom, dateTo, label: quarterLabel(dateFrom.getMonth(), dateFrom.getFullYear()) };
	}
	return null;
}

function shouldSendToday(frequency: string, dayOfMonth: number, today: Date): boolean {
	if (today.getDate() !== dayOfMonth) return false;
	if (frequency === 'QUARTERLY') return QUARTER_START_MONTHS.includes(today.getMonth());
	return frequency === 'MONTHLY';
}

// Corre a diario (ver cron.schedule en server.ts) y decide por tenant si hoy toca mandar su
// reporte — primer sweep cross-tenant sobre AppSetting del proyecto: todo el resto de accesos a
// esa tabla está scoped por tenantId vía el JWT de una request autenticada, pero acá no hay
// request ni usuario mirando, así que se usa prismaUnscoped a propósito.
export async function runScheduledReportsCheck(): Promise<void> {
	const today = new Date();
	const configuredTenants = await prismaUnscoped.appSetting.findMany({ where: { key: FREQUENCY_KEY } });

	for (const config of configuredTenants) {
		try {
			await processTenantReport(config.tenantId, config.value, today);
		} catch (err) {
			console.error(`[scheduled-reports] Falló el reporte del tenant ${config.tenantId}:`, err);
		}
	}
}

async function processTenantReport(tenantId: number, frequency: string, today: Date): Promise<void> {
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
	if (!shouldSendToday(frequency, dayOfMonth, today)) return;
	if (lastSentAtSetting?.value === todayKeyRD()) return; // ya se mandó hoy (ej. proceso reiniciado)

	const period = resolveClosedPeriod(frequency, today);
	if (!period) return;

	const stats = await computeTenantReportStats(tenantId, period.dateFrom, period.dateTo);
	await sendPeriodicReport({ to: recipients, tenantName: tenant.name, periodLabel: period.label, stats });

	await prismaUnscoped.appSetting.upsert({
		where: { tenantId_key: { tenantId, key: LAST_SENT_AT_KEY } },
		update: { value: todayKeyRD() },
		create: { tenantId, key: LAST_SENT_AT_KEY, value: todayKeyRD() },
	});
}
