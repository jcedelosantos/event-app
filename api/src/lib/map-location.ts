// Mismo default que create-map-modal.component.ts en el frontend (centro aproximado de Santo
// Domingo) — el pin de un mapa nuevo arranca ahí hasta que el manager lo reubica a mano haciendo
// clic en el picker de Google Maps. Si nunca lo tocó, no tiene sentido mandarle al comprador un
// link "Cómo llegar" a un punto al azar de la capital — se trata como "sin ubicación real" en vez
// de mostrar una dirección potencialmente incorrecta.
const DEFAULT_LAT = 18.4628068;
const DEFAULT_LNG = -70.0412847;
// ~50m de margen — alcanza para no confundir "nunca tocó el pin" con un mapa real que por
// coincidencia cae cerca del centro de la ciudad.
const EPSILON = 0.0005;

export function hasRealLocation(map: { x: number; y: number } | null | undefined): map is { x: number; y: number } {
	if (!map) return false;
	return Math.abs(map.x - DEFAULT_LAT) > EPSILON || Math.abs(map.y - DEFAULT_LNG) > EPSILON;
}

export function googleMapsLink(lat: number, lng: number): string {
	return `https://www.google.com/maps?q=${lat},${lng}`;
}
