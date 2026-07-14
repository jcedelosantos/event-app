import { ChangeDetectionStrategy, Component, effect, inject, model, output } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { TenantService } from '../../services/tenant.service';
import { Tenant } from '../../../../models/tenants/tenant';
import { extractErrorMessage } from '../../../../utils/api-error';
import { confirm } from '../../../../utils/messages';
import { closeModal } from '../../../../utils/modal';

@Component({
	selector: 'app-edit-tenant-modal',
	imports: [ReactiveFormsModule, DatePipe],
	template: `
		<div class="modal fade" id="editTenantModal" tabindex="-1" aria-labelledby="editTenantModalLabel" aria-hidden="true">
			<div class="modal-dialog">
				<div class="modal-content">
					<div class="modal-header">
						<h1 class="modal-title fs-5" id="editTenantModalLabel">Editar organización</h1>
						<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
					</div>
					<div class="modal-body">
						<form id="editTenantForm" (submit)="$event.preventDefault(); saveForm()" [formGroup]="form">
							<div class="mb-3">
								<label for="editOrgName">Nombre de la organización *</label>
								<input type="text" class="form-control" id="editOrgName" [class.is-invalid]="isInvalid('name')" formControlName="name" />
								@if (isInvalid('name')) {
									<div class="invalid-feedback">El nombre es obligatorio.</div>
								}
							</div>
							@if (errorMessage) {
								<div class="text-danger">{{ errorMessage }}</div>
							}
						</form>

						@if (tenant(); as t) {
							<hr />
							<dl class="row small text-muted mb-0">
								<dt class="col-5">Slug</dt>
								<dd class="col-7">{{ t.slug }}</dd>
								<dt class="col-5">Estado</dt>
								<dd class="col-7">{{ t.active ? 'Activa' : 'Inactiva' }}</dd>
								<dt class="col-5">Usuarios</dt>
								<dd class="col-7">{{ t._count?.users ?? 0 }}</dd>
								<dt class="col-5">Eventos</dt>
								<dd class="col-7">{{ t._count?.events ?? 0 }}</dd>
								<dt class="col-5">Creada el</dt>
								<dd class="col-7">{{ t.createdAt | date: 'medium' }}</dd>
							</dl>
						}
					</div>
					<div class="modal-footer">
						<button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
						<button type="submit" form="editTenantForm" class="btn btn-primary">Guardar</button>
					</div>
				</div>
			</div>
		</div>
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditTenantModalComponent {
	private readonly tenantService = inject(TenantService);

	tenant = model.required<Tenant | null>();
	tenantUpdated = output<void>();
	errorMessage = '';

	form = new FormGroup({
		name: new FormControl<string>('', Validators.required),
	});

	constructor() {
		effect(() => {
			this.errorMessage = '';
			this.form.reset({ name: this.tenant()?.name ?? '' });
		});
	}

	isInvalid(controlName: keyof typeof this.form.controls): boolean {
		const control = this.form.controls[controlName];
		return control.invalid && control.touched;
	}

	saveForm() {
		this.errorMessage = '';
		if (this.form.invalid) {
			this.form.markAllAsTouched();
			return;
		}

		const current = this.tenant();
		if (!current) return;

		const name = this.form.getRawValue().name!;
		confirm('¿Guardar los cambios de esta organización?', {
			onConfirm: () =>
				this.tenantService.updateTenant(current.id, { name }).subscribe({
					next: () => {
						this.tenantUpdated.emit();
						closeModal('editTenantModal');
					},
					error: (err: HttpErrorResponse) => (this.errorMessage = extractErrorMessage(err)),
				}),
		});
	}
}
