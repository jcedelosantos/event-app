import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { authRouter } from './routes/auth';
import { usersRouter } from './routes/users';
import { eventsRouter } from './routes/events';
import { mapsRouter } from './routes/maps';
import { areasRouter } from './routes/areas';
import { ticketsRouter } from './routes/tickets';

const app = express();

app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.use('/auth', authRouter);
app.use('/users', usersRouter);
app.use('/events', eventsRouter);
app.use('/maps', mapsRouter);
app.use('/areas', areasRouter);
app.use('/tickets', ticketsRouter);

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
	console.error(err);
	res.status(500).json({ error: 'Internal server error' });
});

const port = Number(process.env.PORT ?? 3001);
app.listen(port, () => {
	console.log(`seat-app-api listening on http://localhost:${port}`);
});
