import rateLimit from 'express-rate-limit';
import { ApiKeyRequest } from './api-key';

// Ninguna ruta de public.ts tenía rate limiting — un script repitiendo /checkout/hold puede acaparar
// el inventario de un evento en holds PENDING de 15 min, o gastar cuota real de la cuenta PayPal del
// tenant vía /checkout/paypal/order. Límite generoso a propósito (un comprador real reintentando por
// una mala conexión no debería toparse con esto) — el objetivo es frenar un script, no un usuario.
export const checkoutRateLimiter = rateLimit({
	windowMs: 60_000,
	limit: 20,
	standardHeaders: true,
	legacyHeaders: false,
	message: { error: 'Demasiados intentos — espera un momento y vuelve a intentar.' },
});

// API pública (ver routes/public-api.ts) — por CLAVE, no por IP (a diferencia de checkoutRateLimiter):
// una integración real de un tenant puede correr detrás de un proxy/NAT compartido con otras cosas,
// así que agrupar por IP penalizaría tráfico ajeno. requireApiKey corre siempre antes que este
// limiter (ver el orden en public-api.ts), así que req.apiKeyId ya está seteado acá.
export const publicApiRateLimiter = rateLimit({
	windowMs: 60_000,
	limit: 60,
	standardHeaders: true,
	legacyHeaders: false,
	keyGenerator: (req) => String((req as ApiKeyRequest).apiKeyId ?? req.ip),
	message: { error: 'Demasiadas solicitudes — límite de 60 por minuto por API key.' },
});

// Recuperación de contraseña (POST /auth/forgot-password y /auth/reset-password) — sin sesión, así
// que por IP. Frena tanto un script probando usernames al voleo (enumeración, aunque la respuesta ya
// es genérica) como uno probando tokens de reset a fuerza bruta.
export const passwordResetRateLimiter = rateLimit({
	windowMs: 60_000,
	limit: 10,
	standardHeaders: true,
	legacyHeaders: false,
	message: { error: 'Demasiados intentos — espera un momento y vuelve a intentar.' },
});
