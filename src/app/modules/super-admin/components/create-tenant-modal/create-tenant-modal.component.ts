import { ChangeDetectionStrategy, Component, inject, output } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { TenantService } from '../../services/tenant.service';
import { TenantType } from '../../../../models/tenants/tenant';
import { extractErrorMessage } from '../../../../utils/api-error';
import { confirm } from '../../../../utils/messages';
import { closeModal } from '../../../../utils/modal';

@Component({
	selector: 'app-create-tenant-modal',
	imports: [ReactiveFormsModule],
	template: `
		<div class="modal fade" id="createTenantModal" tabindex="-1" aria-labelledby="createTenantModalLabel" aria-hidden="true">
			<div class="modal-dialog">
				<div class="modal-content">
					<div class="modal-header">
						<h1 class="modal-title fs-5" id="createTenantModalLabel">Nueva organización</h1>
						<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
					</div>
					<div class="modal-body">
						<form id="createTenantForm" (submit)="$event.preventDefault(); saveForm()" [formGroup]="form">
							<div class="mb-3">
								<label for="orgName">Nombre de la organización *</label>
								<input type="text" class="form-control" id="orgName" [class.is-invalid]="isInvalid('name')" formControlName="name" placeholder="Club Deportivo Naco" />
								@if (isInvalid('name')) {
									<div class="invalid-feedback">El nombre es obligatorio.</div>
								}
							</div>
							<div class="mb-3">
								<label for="orgType">Tipo de organización *</label>
								<select class="form-select" id="orgType" formControlName="type">
									<option value="GENERAL">General</option>
									<option value="CLUB">Club</option>
									<option value="CHURCH">Iglesia</option>
								</select>
								<div class="form-text">
									Un club pide carnet de socio (o del socio que invita) al reservar un asiento, con máximo 2 invitados por socio por evento.
								</div>
							</div>
							<hr />
							<p class="text-muted small mb-2">Primer usuario admin de esta organización</p>
							<div class="row">
								<div class="col-md-6 mb-3">
									<label for="adminName">Nombre *</label>
									<input type="text" class="form-control" id="adminName" [class.is-invalid]="isInvalid('adminName')" formControlName="adminName" />
									@if (isInvalid('adminName')) {
										<div class="invalid-feedback">El nombre es obligatorio.</div>
									}
								</div>
								<div class="col-md-6 mb-3">
									<label for="adminLastname">Apellido *</label>
									<input type="text" class="form-control" id="adminLastname" [class.is-invalid]="isInvalid('adminLastname')" formControlName="adminLastname" />
									@if (isInvalid('adminLastname')) {
										<div class="invalid-feedback">El apellido es obligatorio.</div>
									}
								</div>
							</div>
							<div class="mb-3">
								<label for="adminEmail">Email *</label>
								<input type="email" class="form-control" id="adminEmail" [class.is-invalid]="isInvalid('adminEmail')" formControlName="adminEmail" />
								@if (isInvalid('adminEmail')) {
									<div class="invalid-feedback">Ingresá un email válido.</div>
								}
							</div>
							<div class="row">
								<div class="col-md-6 mb-3">
									<label for="adminUsername">Username *</label>
									<input type="text" class="form-control" id="adminUsername" [class.is-invalid]="isInvalid('adminUsername')" formControlName="adminUsername" />
									@if (isInvalid('adminUsername')) {
										<div class="invalid-feedback">El username es obligatorio.</div>
									}
								</div>
								<div class="col-md-6 mb-3">
									<label for="adminPassword">Contraseña *</label>
									<input type="password" class="form-control" id="adminPassword" [class.is-invalid]="isInvalid('adminPassword')" formControlName="adminPassword" />
									@if (isInvalid('adminPassword')) {
										<div class="invalid-feedback">Mínimo 4 caracteres.</div>
									}
								</div>
							</div>
							@if (errorMessage) {
								<div class="text-danger">{{ errorMessage }}</div>
							}
						</form>
					</div>
					<div class="modal-footer">
						<button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
						<button type="submit" form="createTenantForm" class="btn btn-primary">Crear organización</button>
					</div>
				</div>
			</div>
		</div>
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreateTenantModalComponent {
	private readonly tenantService = inject(TenantService);

	tenantCreated = output<void>();
	errorMessage = '';

	form = new FormGroup({
		name: new FormControl<string>('', Validators.required),
		type: new FormControl<TenantType>('GENERAL', { nonNullable: true }),
		adminName: new FormControl<string>('', Validators.required),
		adminLastname: new FormControl<string>('', Validators.required),
		adminEmail: new FormControl<string>('', [Validators.required, Validators.email]),
		adminUsername: new FormControl<string>('', Validators.required),
		adminPassword: new FormControl<string>('', [Validators.required, Validators.minLength(4)]),
	});

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

		const value = this.form.getRawValue();
		confirm('¿Crear esta organización?', {
			onConfirm: () =>
				this.tenantService
					.createTenant({
						name: value.name!,
						type: value.type,
						admin: {
							username: value.adminUsername!,
							password: value.adminPassword!,
							name: value.adminName!,
							lastname: value.adminLastname!,
							email: value.adminEmail!,
						},
					})
					.subscribe({
						next: () => {
							this.tenantCreated.emit();
							this.form.reset({ name: '', type: 'GENERAL', adminName: '', adminLastname: '', adminEmail: '', adminUsername: '', adminPassword: '' });
							closeModal('createTenantModal');
						},
						error: (err: HttpErrorResponse) => (this.errorMessage = extractErrorMessage(err)),
					}),
		});
	}
}
