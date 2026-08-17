import { config } from 'dotenv';
import path from 'node:path';

// Corre ANTES de que vitest importe cualquier archivo de test (garantía de setupFiles) — así
// process.env.DATABASE_URL/JWT_SECRET ya están seteados cuando algo importa src/app.ts (que a su
// vez importa lib/prisma.ts y lib/jwt.ts, ambos leen esas env vars al cargar el módulo).
config({ path: path.resolve(__dirname, '../.env.test') });
