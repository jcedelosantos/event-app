import 'dotenv/config';
import path from 'node:path';
import express from 'express';
import cors from 'cors';
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
import { auditLogsRouter } from './routes/audit-logs';

// Red de seguridad: una promesa rechazada sin manejar en cualquier punto del proceso (no solo
// dentro de una request) tumbaba el server entero en Node moderno. asyncHandler cubre las rutas,
// esto cubre cualquier otro caso que se escape (ej. una ruta nueva que alguien agregue sin envolver).
process.on('unhandledRejection', (reason) => {
	console.error('Unhandled promise rejection:', reason);
});

const app = express();

app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

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
app.use('/audit-logs', auditLogsRouter);

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

const port = Number(process.env.PORT ?? 3001);
app.listen(port, () => {
	console.log(`seat-app-api listening on http://localhost:${port}`);
});
