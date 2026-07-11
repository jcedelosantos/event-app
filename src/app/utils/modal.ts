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
		// clicks sobre el modal real; de menos nunca pasa por diseño de Bootstrap.
		if (backdrops.length > openCount) {
			Array.from(backdrops)
				.slice(0, backdrops.length - openCount)
				.forEach((el) => el.remove());
		}
	}, 400);
}

// Cierra un modal usando la instancia global de bootstrap (la misma que crea data-bs-toggle) y
// aplica el cleanup defensivo de arriba.
export function closeModal(id: string) {
	const modalEl = document.getElementById(id);
	if (modalEl) {
		bootstrap.Modal.getOrCreateInstance(modalEl).hide();
	}
	cleanupOrphanedModalBackdrop();
}
