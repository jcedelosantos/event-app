import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
	selector: 'app-export-tickets-modal',
	imports: [],
	template: `
  <div class="modal fade" id="exportTicketsModal" tabindex="-1" aria-labelledby="exportTicketsModalLabel" aria-hidden="true">
		<div class="modal-dialog">
			<div class="modal-content">
				<div class="modal-header">
					<h1 class="modal-title fs-5" id="exportTicketsModalLabel">Export ticket</h1>
					<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
				</div>
				<div class="modal-body">
					<h4>Inform ticket ...</h4>
				</div>
				<div class="modal-footer">
					<button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
					<button type="button" class="btn btn-danger">Export</button>
				</div>
			</div>
		</div>
	</div>`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExportTicketsModalComponent {}
