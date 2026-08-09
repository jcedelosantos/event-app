import { ChangeDetectionStrategy, Component, OnInit, computed, inject, model, output, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { Events } from '../../../../../models/events/events';
import { EventsService } from '../../../events/services/events.service';
import { AuthService } from '../../../../../core/services/auth.service';
import { ServiceRequestsService } from '../../services/service-requests.service';
import { ADDON_PACKAGES_LIST, ADDON_SERVICES, ADDON_SERVICES_LIST, AddOnPackageCode, AddOnServiceCode, computeFixedTotalDOP } from '../../services/addon-catalog';
import { extractErrorMessage } from '../../../../../utils/api-error';
import { closeModal } from '../../../../../utils/modal';
import { Toast } from '../../../../../utils/messages';

type SelectedItem = { catalogCode: AddOnServiceCode; quantity: number };

@Component({
	selector: 'app-create-service-request-modal',
	imports: [ReactiveFormsModule, FormsModule, DecimalPipe],
	template: `<div class="modal fade" id="createServiceRequestModal" tabindex="-1" aria-labelledby="createServiceRequestModalLabel" aria-hidden="true">
		<div class="modal-dialog modal-lg">
			<div class="modal-content">
				<div class="modal-header">
					<h1 class="modal-title fs-5" id="createServiceRequestModalLabel">Nueva solicitud de servicio</h1>
					<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
				</div>
				<div class="modal-body">
					<p class="text-muted small">
						Elegí un paquete sugerido como punto de partida (opcional) o armá tu combinación desde el catálogo. Esto no cobra nada automáticamente — el
						equipo te contacta para cotizar y coordinar.
					</p>

					<label class="mb-1">Paquetes sugeridos</label>
					<div class="d-flex flex-wrap gap-2 mb-3">
						@for (pkg of packages; track pkg.code) {
							<button
								type="button"
								class="btn btn-sm"
								[class.btn-primary]="pkg.planCode === myPlan()"
								[class.btn-outline-secondary]="pkg.planCode !== myPlan()"
								(click)="applyPackage(pkg.code)"
							>
								{{ pkg.name }}
							</button>
						}
					</div>

					<label class="mb-1">Agregar servicio del catálogo</label>
					<div class="row g-2 mb-3">
						<div class="col-6">
							<select class="form-select" [(ngModel)]="pickerCode" [ngModelOptions]="{ standalone: true }">
								@for (svc of catalog; track svc.code) {
									<option [ngValue]="svc.code">{{ svc.name }} — {{ svc.modality }}</option>
								}
							</select>
						</div>
						<div class="col-3">
							<input type="number" min="1" class="form-control" [(ngModel)]="pickerQty" [ngModelOptions]="{ standalone: true }" />
						</div>
						<div class="col-3">
							<button type="button" class="btn btn-outline-primary w-100" (click)="addItem()"><i class="bi bi-plus-lg"></i> Agregar</button>
						</div>
					</div>

					@if (selectedItems().length) {
						<table class="table table-sm">
							<thead>
								<tr>
									<th>Servicio</th>
									<th style="width:90px;">Cant.</th>
									<th style="width:120px;" class="text-end">Subtotal</th>
									<th style="width:40px;"></th>
								</tr>
							</thead>
							<tbody>
								@for (item of selectedItems(); track item.catalogCode; let i = $index) {
									<tr>
										<td>{{ nameOf(item.catalogCode) }} <span class="text-muted small">({{ modalityOf(item.catalogCode) }})</span></td>
										<td>
											<input
												type="number"
												min="1"
												class="form-control form-control-sm"
												[value]="item.quantity"
												(change)="updateQuantity(i, $any($event.target).value)"
											/>
										</td>
										<td class="text-end">{{ subtotalOf(item) }}</td>
										<td>
											<button type="button" class="btn btn-sm btn-link text-danger" (click)="removeItem(i)"><i class="bi bi-trash"></i></button>
										</td>
									</tr>
								}
							</tbody>
						</table>
						<div class="text-end fw-bold mb-3">Total estimado: RD$ {{ totalDOP() | number }}</div>
						<p class="text-muted small">
							Los servicios "a cotizar" o de rango no suman al total — se coordinan aparte con el equipo.
						</p>
					} @else {
						<p class="text-muted">Todavía no agregaste ningún servicio.</p>
					}

					<form [formGroup]="form">
						<div class="mb-3">
							<label for="eventId">Evento relacionado <span class="text-muted">(opcional)</span></label>
							<select class="form-select" formControlName="eventId">
								<option [ngValue]="null">Sin evento específico</option>
								@for (event of events(); track event.id) {
									<option [ngValue]="event.id">{{ event.name }}</option>
								}
							</select>
						</div>
						<div class="mb-3">
							<label for="notes">Notas</label>
							<textarea class="form-control" formControlName="notes" rows="3" placeholder="Contanos fecha, cantidad de asistentes, o cualquier detalle útil"></textarea>
						</div>
					</form>

					@if (errorMessage) {
						<div class="text-danger">{{ errorMessage }}</div>
					}
				</div>
				<div class="modal-footer">
					<button type="button" class="btn btn-secondary btn-sm" data-bs-dismiss="modal"><i class="bi bi-x-lg"></i> Cancelar</button>
					<button type="button" class="btn btn-primary btn-sm" (click)="save()" [disabled]="!selectedItems().length">
						<i class="bi bi-send-fill" aria-hidden="true"></i> Enviar solicitud
					</button>
				</div>
			</div>
		</div>
	</div>`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreateServiceRequestModalComponent implements OnInit {
	private readonly serviceRequestsService = inject(ServiceRequestsService);
	private readonly eventsService = inject(EventsService);
	private readonly authService = inject(AuthService);

	requestSaved = output<void>();
	visible = model<boolean>(false);
	errorMessage = '';

	catalog = ADDON_SERVICES_LIST;
	packages = ADDON_PACKAGES_LIST;
	myPlan = computed(() => this.authService.currentUser()?.tenant?.plan ?? null);

	events = signal<Events[]>([]);
	selectedItems = signal<SelectedItem[]>([]);
	totalDOP = computed(() => computeFixedTotalDOP(this.selectedItems()));

	pickerCode: AddOnServiceCode = 'SCANNER_RENTAL';
	pickerQty = 1;

	appliedPackageCode: AddOnPackageCode | null = null;

	form = new FormGroup({
		eventId: new FormControl<number | null>(null),
		notes: new FormControl<string>(''),
	});

	ngOnInit(): void {
		this.eventsService.getEvents().subscribe((events) => this.events.set(events));
	}

	nameOf(code: AddOnServiceCode): string {
		return ADDON_SERVICES[code].name;
	}

	modalityOf(code: AddOnServiceCode): string {
		return ADDON_SERVICES[code].modality;
	}

	subtotalOf(item: SelectedItem): string {
		const def = ADDON_SERVICES[item.catalogCode];
		if (def.pricingType !== 'FIXED' || def.unitPriceDOP == null) return def.note ?? 'A cotizar';
		return `RD$ ${(def.unitPriceDOP * item.quantity).toLocaleString('es-DO')}`;
	}

	applyPackage(code: AddOnPackageCode) {
		this.appliedPackageCode = code;
		this.selectedItems.set(this.packages.find((p) => p.code === code)!.items.map((i) => ({ ...i })));
	}

	addItem() {
		const qty = Math.max(1, Number(this.pickerQty) || 1);
		this.appliedPackageCode = null; // combinación armada a mano ya no coincide con ningún paquete sugerido
		this.selectedItems.update((items) => {
			const existing = items.find((i) => i.catalogCode === this.pickerCode);
			if (existing) {
				return items.map((i) => (i.catalogCode === this.pickerCode ? { ...i, quantity: i.quantity + qty } : i));
			}
			return [...items, { catalogCode: this.pickerCode, quantity: qty }];
		});
	}

	updateQuantity(index: number, rawValue: string) {
		const qty = Math.max(1, Number(rawValue) || 1);
		this.appliedPackageCode = null;
		this.selectedItems.update((items) => items.map((item, i) => (i === index ? { ...item, quantity: qty } : item)));
	}

	removeItem(index: number) {
		this.appliedPackageCode = null;
		this.selectedItems.update((items) => items.filter((_, i) => i !== index));
	}

	save() {
		if (!this.selectedItems().length) return;

		const value = this.form.getRawValue();
		this.serviceRequestsService
			.create({
				packageCode: this.appliedPackageCode ?? undefined,
				notes: value.notes ?? '',
				eventId: value.eventId ?? undefined,
				items: this.selectedItems(),
			})
			.subscribe({
				next: () => {
					Toast.fire({ icon: 'success', title: 'Solicitud enviada' });
					this.requestSaved.emit();
					this.selectedItems.set([]);
					this.appliedPackageCode = null;
					this.form.reset({ eventId: null, notes: '' });
					this.errorMessage = '';
					closeModal('createServiceRequestModal');
				},
				error: (err: HttpErrorResponse) => {
					this.errorMessage = extractErrorMessage(err);
				},
			});
	}
}
