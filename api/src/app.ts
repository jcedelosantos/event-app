import 'dotenv/config';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import express from 'express';
import cors from 'cors';
import { prismaUnscoped } from './lib/prisma';
import { asyncHandler } from './lib/async-handler';
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
import { signupEventRouter } from './routes/signup-event';
import { auditLogsRouter } from './routes/audit-logs';
import { settingsRouter } from './routes/settings';
import { tenantsRouter } from './routes/tenants';
import { platformSettingsRouter } from './routes/platform-settings';
import { childrenRouter } from './routes/children';
import { subscriptionRouter } from './routes/subscription';
import { accessPointsRouter } from './routes/access-points';
import { locationsRouter } from './routes/locations';
import { apiKeysRouter } from './routes/api-keys';
import { publicApiRouter } from './routes/public-api';
import { serviceRequestsRouter } from './routes/service-requests';
import { enterpriseLeadsRouter } from './routes/enterprise-leads';
import { uploadsRouter } from './routes/uploads';
import { invoicesRouter } from './routes/invoices';
import { eventTransactionsRouter } from './routes/event-transactions';
import { uploadsDir } from './lib/uploads';

// Express app puro, sin app.listen() ni crons — separado de server.ts para poder importarlo desde
// los tests de integración (supertest) sin bindear un puerto real ni arrancar los cron jobs.
export const app = express();

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
app.use('/public', signupEventRouter);
app.use('/audit-logs', auditLogsRouter);
app.use('/settings', settingsRouter);
app.use('/tenants', tenantsRouter);
app.use('/platform-settings', platformSettingsRouter);
app.use('/children', childrenRouter);
app.use('/subscription', subscriptionRouter);
app.use('/access-points', accessPointsRouter);
app.use('/locations', locationsRouter);
app.use('/api-keys', apiKeysRouter);
app.use('/api/v1', publicApiRouter);
app.use('/service-requests', serviceRequestsRouter);
app.use('/enterprise-leads', enterpriseLeadsRouter);
app.use('/invoices', invoicesRouter);
app.use('/event-transactions', eventTransactionsRouter);

// En producción, este mismo proceso también sirve el build de Angular (single-service deploy:
// sin CORS, sin necesidad de un dominio aparte para el frontend). En dev, el frontend corre
// aparte con `ng serve` y esta carpeta no existe, así que no interfiere.
const frontendDist = path.join(__dirname, '../../dist/seat-app/browser');
const indexHtmlPath = path.join(frontendDist, 'index.html');
// Se lee una sola vez al arrancar (no en cada request) — mismo criterio que servir el resto del
// build como estático, la única diferencia acá es que a ESTE archivo puntual a veces hay que
// inyectarle una línea antes de mandarlo (ver más abajo).
let indexHtmlTemplate: string | null = null;
try {
	indexHtmlTemplate = readFileSync(indexHtmlPath, 'utf-8');
} catch {
	// dev local sin build de Angular todavía generado — el catch-all de abajo cae a sendFile, que
	// falla con next() igual que siempre si el archivo no existe.
}

app.use(express.static(frontendDist));
app.get('*', asyncHandler(async (req, res, next) => {
	if (req.method !== 'GET' || req.path.startsWith('/uploads')) {
		next();
		return;
	}

	// Dominio propio de un tenant Enterprise (ver Tenant.customDomain) — si el Host de este request
	// coincide, se inyecta el slug en window antes de mandar el index.html, para que Angular
	// (ver app.routes.ts, ruta '') renderice el portal público de ESE tenant en la raíz del dominio
	// del cliente, sin que la URL cambie a integ.cedanet.net/o/:slug. Sin match (el caso normal,
	// siempre para integ.cedanet.net) esto es un no-op: cae exactamente al sendFile de siempre.
	if (indexHtmlTemplate) {
		const host = (req.hostname || '').toLowerCase();
		if (host) {
			const tenant = await prismaUnscoped.tenant.findUnique({ where: { customDomain: host }, select: { slug: true } });
			if (tenant) {
				const html = indexHtmlTemplate.replace('</head>', `<script>window.__CUSTOM_DOMAIN_TENANT_SLUG__=${JSON.stringify(tenant.slug)};</script></head>`);
				res.type('html').send(html);
				return;
			}
		}
	}

	res.sendFile(indexHtmlPath, (err) => {
		if (err) next();
	});
}));

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
	console.error(err);
	res.status(500).json({ error: 'Internal server error' });
});
