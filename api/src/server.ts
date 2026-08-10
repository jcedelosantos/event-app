import 'dotenv/config';
import path from 'node:path';
import express from 'express';
import cors from 'cors';
import cron from 'node-cron';
import { authRouter } from './routes/auth';
import { usersRouter } from './routes/users';
import { eventsRouter } from './routes/events';
import { mapsRouter } from './routes/maps';
import { areasRouter } from './routes/areas';
import { ticketsRouter } from './routes/tickets';
import { productsRouter } from './routes/products';
import { seatsRouter } from './routes/seats';
import { tablesRouter } from './routes/tables';
import { saleTicketsRouter } from './routes/sale-tickets';
import { saleProductsRouter } from './routes/sale-products';
import { scanRouter } from './routes/scan';
import { publicRouter } from './routes/public';
import { signupRouter } from './routes/signup';
import { auditLogsRouter } from './routes/audit-logs';
import { settingsRouter } from './routes/settings';
import { tenantsRouter } from './routes/tenants';
import { platformSettingsRouter } from './routes/platform-settings';
import { childrenRouter } from './routes/children';
import { subscriptionRouter } from './routes/subscription';
import { accessPointsRouter } from './routes/access-points';
import { serviceRequestsRouter } from './routes/service-requests';
import { uploadsRouter } from './routes/uploads';
import { uploadsDir } from './lib/uploads';
import { runScheduledReportsCheck } from './lib/scheduled-reports';

// Red de seguridad: una promesa rechazada sin manejar en cualquier punto del proceso (no solo
// dentro de una request) tumbaba el server entero en Node moderno. asyncHandler cubre las rutas,
// esto cubre cualquier otro caso que se escape (ej. una ruta nueva que alguien agregue sin envolver).
process.on('unhandledRejection', (reason) => {
	console.error('Unhandled promise rejection:', reason);
});

const app = express();

// Railway pone el tráfico detrás de su propio proxy — sin esto, Express no confía en el header
// X-Forwarded-For, y express-rate-limit (checkoutRateLimiter, ver middleware/rate-limit.ts) no
// puede identificar la IP real de cada request: todas las requests terminan agrupadas bajo la IP
// del proxy, así que el límite por-IP deja de tener sentido (y loguea un ValidationError en cada
// request a una ruta rate-limited). `1` = confiar en un solo hop de proxy (el de Railway).
app.set('trust proxy', 1);

// exposedHeaders: sin esto el navegador descarta X-Total-Count antes de que el frontend pueda
// leerlo (ver sale-tickets.ts/sale-products.ts GET / — aviso de "historial truncado" en la UI).
app.use(cors({ exposedHeaders: ['X-Total-Count'] }));
// El body crudo se guarda en req.rawBody además de parsearse — lo necesita el webhook de WhatsApp
// para verificar la firma HMAC de Meta (ver lib/whatsapp.ts), que se calcula sobre los bytes
// exactos recibidos, no sobre el objeto ya parseado (que puede serializar distinto).
app.use(
	express.json({
		verify: (req, _res, buf) => {
			(req as express.Request & { rawBody?: Buffer }).rawBody = buf;
		},
	}),
);

app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/uploads', express.static(uploadsDir));
app.use('/uploads', uploadsRouter);

app.use('/auth', authRouter);
app.use('/users', usersRouter);
app.use('/events', eventsRouter);
app.use('/maps', mapsRouter);
app.use('/areas', areasRouter);
app.use('/tickets', ticketsRouter);
app.use('/products', productsRouter);
app.use('/seats', seatsRouter);
app.use('/tables', tablesRouter);
app.use('/sale-tickets', saleTicketsRouter);
app.use('/sale-products', saleProductsRouter);
app.use('/scan', scanRouter);
app.use('/public', publicRouter);
app.use('/public', signupRouter);
app.use('/audit-logs', auditLogsRouter);
app.use('/settings', settingsRouter);
app.use('/tenants', tenantsRouter);
app.use('/platform-settings', platformSettingsRouter);
app.use('/children', childrenRouter);
app.use('/subscription', subscriptionRouter);
app.use('/access-points', accessPointsRouter);
app.use('/service-requests', serviceRequestsRouter);

// En producción, este mismo proceso también sirve el build de Angular (single-service deploy:
// sin CORS, sin necesidad de un dominio aparte para el frontend). En dev, el frontend corre
// aparte con `ng serve` y esta carpeta no existe, así que no interfiere.
const frontendDist = path.join(__dirname, '../../dist/seat-app/browser');
app.use(express.static(frontendDist));
app.get('*', (req, res, next) => {
	if (req.method !== 'GET' || req.path.startsWith('/uploads')) {
		next();
		return;
	}
	res.sendFile(path.join(frontendDist, 'index.html'), (err) => {
		if (err) next();
	});
});

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
	console.error(err);
	res.status(500).json({ error: 'Internal server error' });
});

// 13:00 UTC = 8:00am hora RD (UTC-4 fijo, sin horario de verano) — a propósito para que el
// reporte llegue en horario laboral local y no de madrugada. Si algún día hay tenants fuera de
// RD, esto tendría que volverse configurable por tenant; hoy todos los tenants reales son de RD.
cron.schedule('0 13 * * *', () => {
	runScheduledReportsCheck().catch((err) => console.error('[scheduled-reports] Falló el chequeo diario:', err));
});

const port = Number(process.env.PORT ?? 3001);
app.listen(port, () => {
	console.log(`seat-app-api listening on http://localhost:${port}`);
});
