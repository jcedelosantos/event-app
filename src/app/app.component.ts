import { Component, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { cleanupOrphanedModalBackdrop } from './utils/modal';

@Component({
	selector: 'app-root',
	imports: [RouterOutlet],
	templateUrl: './app.component.html',
	styleUrl: './app.component.css',
})
export class AppComponent implements OnInit {
	title = 'seat-app';

	ngOnInit(): void {
		// El fix de "backdrop fantasma" (utils/modal.ts) solo corría cuando el código llamaba a
		// closeModal() explícitamente — pero la mayoría de los botones "Close"/X de los modales
		// usan data-bs-dismiss="modal" (el data-API nativo de Bootstrap), que nunca pasa por ahí.
		// Si ESE cierre deja un backdrop fantasma, el próximo modal que se abre se apila arriba y
		// la página queda bloqueada. 'hidden.bs.modal' burbujea en el document para CUALQUIER
		// cierre (dismiss nativo, hide() programático, ESC, click afuera) — escucharlo acá una
		// sola vez cubre todos los modales de la app sin tener que tocar cada uno.
		document.addEventListener('hidden.bs.modal', () => cleanupOrphanedModalBackdrop());
		// Además, al ABRIR: si un cierre anterior nunca disparó 'hidden.bs.modal' (ej. Angular
		// destruyó el nodo del modal antes de que Bootstrap terminara su secuencia de cierre), el
		// backdrop fantasma queda ahí desde antes de esta apertura — reconciliar acá también evita
		// que se vaya acumulando con cada modal nuevo que se abre.
		document.addEventListener('shown.bs.modal', () => cleanupOrphanedModalBackdrop());
	}
}
