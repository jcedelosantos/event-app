import rateLimit from 'express-rate-limit';

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
