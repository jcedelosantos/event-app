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

// Firma exacta del bug reproducido en producción ("editar un ticket dos veces se congela"): el
// modal queda con la clase "show" puesta pero display:none, para siempre. Se probó primero un
// guard basado en 'hidden.bs.modal'/'transitionend' (esperar a que Bootstrap confirme que el
// cierre anterior terminó antes de permitir un show() nuevo) — pero el bug reprodujo IGUAL incluso
// cuando 'hidden.bs.modal' ya había disparado antes del segundo click: el show() nuevo reutiliza
// el MISMO backdrop de Bootstrap (una sola instancia por modal, no se recrea en cada show/hide), y
// si ese backdrop todavía está resolviendo su propia transición de salida interna cuando se le
// pide un show() nuevo, el callback que dispara _showElement() (el paso que de verdad pone
// display:block) se pierde — Bootstrap queda con _isShown=true internamente (por eso un segundo
// .show() en la misma instancia es un no-op silencioso: revisa _isShown antes que nada) pero el
// DOM nunca se actualiza. No hay forma confiable de anticipar esa ventana desde afuera sin acoplar
// este código a detalles internos de una versión puntual de Bootstrap.
// En vez de prevenir la carrera, este watchdog detecta el resultado roto directamente: bastante
// después (400ms) de cualquier intento de abrir un modal, si sigue con "show" pero display:none,
// es que quedó pisado — se descarta la instancia vieja (que tiene el estado interno corrupto) y se
// crea una limpia para reabrir. Un modal que abrió bien nunca pasa por _showElement con display
// distinto de "block" en este punto, así que no hay falsos positivos.
const STUCK_CHECK_DELAY_MS = 400;

function isStuckOpen(modalEl: HTMLElement): boolean {
	return modalEl.classList.contains('show') && getComputedStyle(modalEl).display === 'none';
}

function recoverStuckModal(modalEl: HTMLElement) {
	bootstrap.Modal.getInstance(modalEl)?.dispose();
	document.querySelectorAll('.modal-backdrop').forEach((el) => el.remove());
	document.body.classList.remove('modal-open');
	document.body.style.removeProperty('overflow');
	document.body.style.removeProperty('padding-right');
	modalEl.classList.remove('show');
	modalEl.style.removeProperty('display');
	bootstrap.Modal.getOrCreateInstance(modalEl).show();
}

export function installModalRaceGuard() {
	document.addEventListener(
		'show.bs.modal',
		(event: Event) => {
			const modalEl = event.target as HTMLElement;
			if (!modalEl) return;
			setTimeout(() => {
				if (isStuckOpen(modalEl)) recoverStuckModal(modalEl);
			}, STUCK_CHECK_DELAY_MS);
		},
		true,
	);
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
