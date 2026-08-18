import { AuthTokenPayload } from './jwt';

// Filtro adicional (no de aislamiento — ese es tenantId) para restringir a un usuario asignado a
// una sede (ver User.locationId/Location) a solo lo de esa sede. Un usuario sin locationId (todo
// tenant que nunca da de alta una sede, o cualquier staff sin sede asignada dentro de uno que sí
// las tiene) devuelve {} — la query queda idéntica a como era antes de esta feature.
export function locationScope(user: AuthTokenPayload): { locationId?: number } {
	return user.locationId != null ? { locationId: user.locationId } : {};
}
