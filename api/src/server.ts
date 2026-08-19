import cron from 'node-cron';
import { app } from './app';
import { runScheduledReportsCheck } from './lib/scheduled-reports';
import { runEventPlanExpiryCheck } from './lib/event-plan-expiry';
import { runMonthlyInvoiceGeneration } from './lib/invoice-cron';
import { runEventOverageSummaryCheck } from './lib/overage-summary';
import { cleanupExpiredWaitingRoomEntries } from './lib/waiting-room';

// Red de seguridad: una promesa rechazada sin manejar en cualquier punto del proceso (no solo
// dentro de una request) tumbaba el server entero en Node moderno. asyncHandler cubre las rutas,
// esto cubre cualquier otro caso que se escape (ej. una ruta nueva que alguien agregue sin envolver).
process.on('unhandledRejection', (reason) => {
	console.error('Unhandled promise rejection:', reason);
});

// 13:00 UTC = 8:00am hora RD (UTC-4 fijo, sin horario de verano) — a propósito para que el
// reporte llegue en horario laboral local y no de madrugada. Si algún día hay tenants fuera de
// RD, esto tendría que volverse configurable por tenant; hoy todos los tenants reales son de RD.
cron.schedule('0 13 * * *', () => {
	runScheduledReportsCheck().catch((err) => console.error('[scheduled-reports] Falló el chequeo diario:', err));
});

// Mismo horario UTC de referencia que el cron de arriba, corrido media hora después para no
// competir por el mismo tick — pasa a modo consulta a los tenants de evento único cuyo evento ya
// terminó (ver lib/event-plan-expiry.ts).
cron.schedule('30 13 * * *', () => {
	runEventPlanExpiryCheck().catch((err) => console.error('[event-plan-expiry] Falló el chequeo diario:', err));
});

// Mismo horario de referencia, corrido 15 minutos después del cron de arriba — resumen post-evento
// de excedente para CUALQUIER evento terminado (recurrente o de evento único, ver
// lib/overage-summary.ts), no solo los de evento único que expira event-plan-expiry.
cron.schedule('45 13 * * *', () => {
	runEventOverageSummaryCheck().catch((err) => console.error('[overage-summary] Falló el chequeo diario:', err));
});

// Mismo horario UTC de referencia, corrido una hora después del cron de reportes — el "1" en el
// campo de día del mes lo limita a correr una sola vez por mes (ver invoice-cron.ts).
cron.schedule('0 14 1 * *', () => {
	runMonthlyInvoiceGeneration().catch((err) => console.error('[invoice-cron] Falló la generación mensual:', err));
});

// Cada 5 minutos, sin relación con el horario UTC de referencia de arriba — a diferencia de esos
// (resúmenes diarios/mensuales), esto es pura limpieza de espacio (ver waiting-room.ts) y conviene
// que corra seguido para que la tabla no crezca entre sale masiva y sale masiva.
cron.schedule('*/5 * * * *', () => {
	cleanupExpiredWaitingRoomEntries().catch((err) => console.error('[waiting-room] Falló la limpieza periódica:', err));
});

const port = Number(process.env.PORT ?? 3001);
app.listen(port, () => {
	console.log(`integ-api listening on http://localhost:${port}`);
});
