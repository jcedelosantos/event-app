import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
	selector: 'app-import-tickets-modal',
	imports: [],
	template: `
  <div class="modal fade" id="importTicketsModal" tabindex="-1" aria-labelledby="importTicketsModalLabel" aria-hidden="true">
		<div class="modal-dialog">
			<div class="modal-content">
				<div class="modal-header">
					<h1 class="modal-title fs-5" id="importTicketsModalLabel">Importar tickets</h1>
					<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
				</div>
				<div class="modal-body">
					<h4>Información de tickets...</h4>
				</div>
				<div class="modal-footer">
					<button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cerrar</button>
					<button type="button" class="btn btn-danger">Importar</button>
				</div>
			</div>
		</div>
	</div>`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ImportTicketsModalComponent {}
