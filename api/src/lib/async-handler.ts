import { NextFunction, Request, RequestHandler, Response } from 'express';

// Express 4 no reenvía automáticamente el rechazo de una promesa de un handler async al
// middleware de errores — un `throw` (o una promesa rechazada) dentro de un handler async se
// convierte en un "unhandled promise rejection" a nivel de proceso, que en Node moderno tumba
// el servidor ENTERO (no solo esa request). Pasó de verdad: borrar un área con asientos lanzaba
// un error de Prisma no manejado y crasheaba toda la API. Envolver cada handler async con esto
// asegura que cualquier error termine en el middleware de errores de server.ts en vez de tirar
// abajo el proceso.
export function asyncHandler(handler: RequestHandler): RequestHandler {
	return (req: Request, res: Response, next: NextFunction) => {
		Promise.resolve(handler(req, res, next)).catch(next);
	};
}
