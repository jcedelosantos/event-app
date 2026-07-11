import { HttpErrorResponse } from '@angular/common/http';

// El backend devuelve { error: "mensaje" } para errores de negocio, o
// { error: ZodError.flatten() } — { formErrors: string[], fieldErrors: Record<string, string[]> } —
// para errores de validación. Esta función los convierte a un mensaje legible en ambos casos.
export function extractErrorMessage(err: HttpErrorResponse): string {
	const payload = err.error?.error;

	if (typeof payload === 'string') {
		return payload;
	}

	if (payload && typeof payload === 'object') {
		const fieldMessages = Object.entries(payload.fieldErrors ?? {})
			.filter(([, messages]) => Array.isArray(messages) && messages.length)
			.map(([field, messages]) => `${field}: ${(messages as string[]).join(', ')}`);
		const formMessages: string[] = Array.isArray(payload.formErrors) ? payload.formErrors : [];
		const combined = [...formMessages, ...fieldMessages].join(' — ');
		if (combined) return combined;
	}

	return err.message || 'Ocurrió un error inesperado.';
}
