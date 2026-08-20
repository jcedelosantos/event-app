import { ChangeDetectionStrategy, Component, effect, inject, model, output } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { TenantService } from '../../services/tenant.service';
import { PlanCode, Tenant, TenantType } from '../../../../models/tenants/tenant';
import { extractErrorMessage } from '../../../../utils/api-error';
import { confirm, error, promptConfirmText, Toast } from '../../../../utils/messages';
import { closeModal } from '../../../../utils/modal';
import { EVENT_PLANS, isEventPlanCode } from '../../../../shared/event-plans';

@Component({
	selector: 'app-edit-tenant-modal',
	imports: [ReactiveFormsModule, DatePipe],
	template: `
		<div class="modal fade" id="editTenantModal" tabindex="-1" aria-labelledby="editTenantModalLabel" aria-hidden="true">
			<div class="modal-dialog">
				<div class="modal-content">
					<div class="modal-header">
						<h1 class="modal-title fs-5" id="editTenantModalLabel">Editar organización</h1>
						<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
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
							<div class="mb-3">
								<label for="editOrgType">Tipo de organización *</label>
								<select class="form-select" id="editOrgType" formControlName="type">
									<option value="GENERAL">General</option>
									<option value="CLUB">Club</option>
									<option value="CHURCH">Iglesia</option>
									<option value="ONG">ONG</option>
									<option value="PRIVADA">Empresa privada</option>
									<option value="PUBLICA">Institución pública</option>
									<option value="INDEPENDIENTE">Independiente</option>
								</select>
								<div class="form-text">
									Un club pide carnet de socio (o del socio que invita) al reservar un asiento, con máximo 2 invitados por socio por evento.
								</div>
							</div>
							<hr />
							<p class="text-muted small mb-2">Datos para el bloque "Para" de la factura (opcionales).</p>
							<div class="mb-3">
								<label for="editOrgRnc">RNC / Cédula</label>
								<input type="text" class="form-control" id="editOrgRnc" formControlName="rnc" />
							</div>
							<div class="mb-3">
								<label for="editOrgPhone">Teléfono</label>
								<input type="text" class="form-control" id="editOrgPhone" formControlName="phone" />
							</div>
							<div class="mb-3">
								<label for="editOrgAddress">Dirección</label>
								<input type="text" class="form-control" id="editOrgAddress" formControlName="address" />
							</div>
							<hr />
							@if (isEventTenant()) {
								<div class="mb-3">
									<label>Plan</label>
									<p class="form-control-plaintext py-0">{{ eventPlanName() }} <span class="text-muted small">(evento único)</span></p>
									<div class="form-text">
										Es un plan de pago único, no una suscripción — se gestiona desde la cola de comprobantes, no editable acá. Cambiar
										otros datos de esta organización no toca su plan.
									</div>
								</div>
							} @else {
								<div class="mb-3">
									<label for="editOrgPlan">Plan</label>
									<select class="form-select" id="editOrgPlan" formControlName="plan">
										<option [ngValue]="null">Sin plan</option>
										<option value="BASICO">Básico</option>
										<option value="INTERMEDIO">Intermedio</option>
										<option value="AVANZADO">Avanzado</option>
										<option value="PRO_MAX">Pro Enterprise</option>
									</select>
									<div class="form-text">
										Cambiarlo acá lo deja ACTIVE al instante, facturado fuera del sistema (transferencia o factura directa) — no toca la suscripción de PayPal si el tenant ya tenía una activa.
									</div>
								</div>
							}
							<hr />
							<div class="mb-3">
								<label for="editOrgCustomDomain">Dominio propio <span class="text-muted">(opcional — Enterprise)</span></label>
								<input type="text" class="form-control" id="editOrgCustomDomain" placeholder="ej. entradas.suclub.com" formControlName="customDomain" />
								<div class="form-text">
									El cliente apunta este dominio por CNAME al servicio de Railway. Una vez que el DNS propague, su portal público carga
									directo en ese dominio (sin integ.cedanet.net en la URL).
								</div>
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
							<hr />
							<div class="border border-danger-subtle rounded p-3">
								<p class="text-danger fw-semibold mb-1">Zona de peligro</p>
								<p class="text-muted small mb-2">
									Borra la organización y TODO lo que tenga adentro (eventos, tickets vendidos, usuarios, facturas...) — no se puede deshacer. Para
									solo dejar de facturarla sin perder sus datos, usá el interruptor de "Activa/Inactiva" de la lista en vez de esto.
								</p>
								<button type="button" class="btn btn-outline-danger btn-sm" (click)="deleteTenant()">Eliminar organización</button>
							</div>
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
		type: new FormControl<TenantType>('GENERAL', { nonNullable: true }),
		plan: new FormControl<PlanCode | null>(null),
		rnc: new FormControl<string>('', { nonNullable: true }),
		phone: new FormControl<string>('', { nonNullable: true }),
		address: new FormControl<string>('', { nonNullable: true }),
		customDomain: new FormControl<string>('', { nonNullable: true }),
	});

	constructor() {
		effect(() => {
			this.errorMessage = '';
			const t = this.tenant();
			this.form.reset({
				name: t?.name ?? '',
				type: t?.type ?? 'GENERAL',
				plan: (t?.plan as PlanCode | null) ?? null,
				rnc: t?.rnc ?? '',
				phone: t?.phone ?? '',
				address: t?.address ?? '',
				customDomain: t?.customDomain ?? '',
			});
		});
	}

	isInvalid(controlName: keyof typeof this.form.controls): boolean {
		const control = this.form.controls[controlName];
		return control.invalid && control.touched;
	}

	// Un tenant de evento único (EVENT_100, EVENT_300...) no es uno de los PlanCode recurrentes que
	// entiende este selector — antes se cargaba igual en el FormControl (el <select> no tiene ningún
	// <option> que matchee, así que queda visualmente en blanco) y al guardar CUALQUIER otro campo
	// (nombre, teléfono...) el backend rechazaba el plan por no ser un PlanCode válido, bloqueando
	// la edición entera de estos tenants. Ver isEventTenant()/eventPlanName() en el template.
	isEventTenant(): boolean {
		return isEventPlanCode(this.tenant()?.plan ?? null);
	}

	eventPlanName(): string {
		const code = this.tenant()?.plan;
		return EVENT_PLANS.find((p) => p.code === code)?.name ?? code ?? '';
	}

	saveForm() {
		this.errorMessage = '';
		if (this.form.invalid) {
			this.form.markAllAsTouched();
			return;
		}

		const current = this.tenant();
		if (!current) return;

		const value = this.form.getRawValue();
		confirm('¿Guardar los cambios de esta organización?', {
			onConfirm: () =>
				this.tenantService
					.updateTenant(current.id, {
						name: value.name!,
						type: value.type,
						// Sin plan (undefined) para un tenant de evento único — así el backend no lo toca, ver
						// isEventTenant() arriba.
						...(this.isEventTenant() ? {} : { plan: value.plan ?? null }),
						rnc: value.rnc,
						address: value.address,
						phone: value.phone,
						customDomain: value.customDomain?.trim() || null,
					})
					.subscribe({
					next: () => {
						this.tenantUpdated.emit();
						closeModal('editTenantModal');
					},
					error: (err: HttpErrorResponse) => (this.errorMessage = extractErrorMessage(err)),
				}),
		});
	}

	deleteTenant() {
		const current = this.tenant();
		if (!current) return;

		// El modal de Bootstrap tiene su propia trampa de foco (para que Tab no se escape mientras
		// está abierto) — si sigue abierto detrás, le roba el foco al input de SweetAlert apenas
		// intenta enfocarse, y no deja escribir nada ahí (bug real reportado probando esto). Cerrarlo
		// antes de mostrar la confirmación evita la pelea por el foco.
		closeModal('editTenantModal');
		this.errorMessage = '';
		promptConfirmText(
			'Eliminar organización',
			`Esto borra "${current.name}" y TODOS sus datos (eventos, tickets, usuarios, facturas) para siempre. Escribí el nombre exacto para confirmar.`,
			current.name,
		).then((confirmed) => {
			if (!confirmed) return;
			this.tenantService.deleteTenant(current.id, current.name).subscribe({
				next: () => {
					Toast.fire({ icon: 'success', title: 'Organización eliminada' });
					this.tenantUpdated.emit();
				},
				// El modal ya está cerrado acá (se cerró arriba antes de confirmar) — this.errorMessage no
				// se vería en ningún lado, por eso el error se muestra en su propio diálogo.
				error: (err: HttpErrorResponse) => error(extractErrorMessage(err), 'No se pudo eliminar'),
			});
		});
	}
}
