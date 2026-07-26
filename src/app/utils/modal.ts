declare const bootstrap: any;

// Bootstrap remueve el backdrop al terminar la transición CSS de fade-out escuchando
// 'transitionend'; en la práctica esa escucha a veces no dispara (closes muy seguidos, cambios
// de layout de Angular en el medio, etc.) y deja un backdrop fantasma bloqueando toda la página
// (position: fixed + pointer-events: auto sobre todo el viewport) — se ve como que la app se
// "congeló" hasta refrescar. Este cleanup corre siempre después de cerrar un modal, sea cual sea
// la causa puntual, y es agnóstico a qué instancia de bootstrap (import ES vs script global)
// hizo el hide().
export function cleanupOrphanedModalBackdrop() {
	setTimeout(() => {
		const openCount = document.querySelectorAll('.modal.show').length;
		const backdrops = document.querySelectorAll('.modal-backdrop');
		if (openCount === 0) {
			backdrops.forEach((el) => el.remove());
			document.body.classList.remove('modal-open');
			document.body.style.removeProperty('overflow');
			document.body.style.removeProperty('padding-right');
			return;
		}
		// Bootstrap apila un backdrop por cada modal abierto (para nested modals) — si un cierre
		// previo dejó un backdrop fantasma sin sacar, un modal legítimamente abierto puede terminar
		// con MÁS backdrops que modales realmente abiertos. Sobran, no faltan: de más bloquean
		// clicks sobre el modal real; de menos nunca pasa por diseño de Bootstrap. El backdrop más
		// nuevo es el del modal recién (re)abierto — el que hay que conservar — así que se
		// descartan los más viejos.
		if (backdrops.length > openCount) {
			Array.from(backdrops)
				.slice(0, backdrops.length - openCount)
				.forEach((el) => el.remove());
		}
	}, 400);
}

// ids de modales que están a mitad de un hide() — desde que se llama closeModal() hasta que
// Bootstrap confirma con 'hidden.bs.modal' que la transición de cierre terminó de verdad.
const closingModalIds = new Set<string>();

// Bootstrap's hide() con "fade" es async: el modal en sí puede reaccionar rápido, pero SU
// BACKDROP tiene su propia transición de salida (~300ms) corriendo en la MISMA instancia. Si el
// usuario reabre el MISMO modal en esa ventana (ej. crear un ticket y al toque tocar "editar" en
// la fila recién creada, mismo id de modal vía data-bs-toggle), el show() nuevo reutiliza ese
// backdrop a medio cerrar: dos transiciones CSS pisándose en el mismo elemento hacen que el
// listener de 'transitionend' del show() nuevo nunca dispare, y el paso que pone display:block
// queda esperando para siempre — el modal termina con la clase "show" puesta pero display:none y
// el backdrop bloqueando clicks en toda la página: la app se ve "congelada" hasta refrescar.
//
// 'show.bs.modal' es el hook público que Bootstrap expone justo para esto: dispara ANTES de tocar
// cualquier estado interno, y si se le hace preventDefault() el show() se cancela ahí mismo sin
// efectos secundarios. Se instala una sola vez (ver app.component.ts) y cubre TODO intento de
// abrir un modal, sea por data-bs-toggle o por un bootstrap.Modal(...).show() a mano — si ese
// modal todavía está cerrando, se pospone la apertura real hasta que 'hidden.bs.modal' confirme
// que terminó, en vez de dejar que Bootstrap se pise solo.
export function installModalRaceGuard() {
	document.addEventListener(
		'show.bs.modal',
		(event: Event) => {
			const modalEl = event.target as HTMLElement;
			if (!modalEl?.id || !closingModalIds.has(modalEl.id)) return;
			event.preventDefault();
			modalEl.addEventListener(
				'hidden.bs.modal',
				() => bootstrap.Modal.getOrCreateInstance(modalEl).show(),
				{ once: true },
			);
		},
		true,
	);
}

// Cierra un modal usando la instancia global de bootstrap (la misma que crea data-bs-toggle) y
// aplica el cleanup defensivo de arriba.
export function closeModal(id: string) {
	const modalEl = document.getElementById(id);
	if (modalEl) {
		closingModalIds.add(id);
		modalEl.addEventListener('hidden.bs.modal', () => closingModalIds.delete(id), { once: true });
		bootstrap.Modal.getOrCreateInstance(modalEl).hide();
	}
	cleanupOrphanedModalBackdrop();
}
