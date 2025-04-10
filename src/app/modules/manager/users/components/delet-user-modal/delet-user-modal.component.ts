import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
	selector: 'app-delet-user-modal',
	imports: [],
	template: `
		<div class="modal fade" id="deletUserModal" tabindex="-1" aria-labelledby="deletUserModalLabel" aria-hidden="true">
			<div class="modal-dialog">
				<div class="modal-content">
					<div class="modal-header">
						<h1 class="modal-title fs-5" id="deletUserModalLabel">delet user</h1>
						<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
					</div>
					<div class="modal-body">
					<h4>Inform user ... </h4>
					</div>
					<div class="modal-footer">
						<button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
						<button type="button" class="btn btn-danger">Delet</button>
					</div>
				</div>
			</div>
		</div>
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DeletUserModalComponent {}
