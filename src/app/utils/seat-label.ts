// Los asientos generados en anillo alrededor de una mesa se llaman "Mesa 12-6" (mesa-asiento) para
// que el nombre completo sea único e identificable en listas/dropdowns. Mostrar ese nombre entero
// como etiqueta sobre el mapa (donde hay 10 asientos apretados en un anillo chico) se atropella —
// alcanza con el número de silla, la posición ya dice a qué mesa pertenece. La mesa misma se llama
// "Mesa 12" (sin guion) — el mismo regex sirve para las dos formas, tomando los dígitos finales.
export function shortSeatLabel(name: string): string {
	const match = name.match(/(\d+)$/);
	return match ? match[1] : name;
}
