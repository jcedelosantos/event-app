import { ChangeDetectionStrategy, Component, effect, inject, Input, model, OnChanges, output } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { Seat } from '../../../../../models/maps/seat';
import { SeatsService } from '../../services/seats.service';
import { extractErrorMessage } from '../../../../../utils/api-error';
import { closeModal } from '../../../../../utils/modal';

@Component({
	selector: 'create-seat-modal',
	imports: [ReactiveFormsModule],
	template: `
		<div class="modal fade" id="createSeatModal" tabindex="-1" aria-labelledby="createSeatModalLabel" aria-hidden="true">
			<div class="modal-dialog">
				<div class="modal-content">
					<div class="modal-header">
						<h1 class="modal-title fs-5" id="createSeatModalLabel">{{ seat() ? 'Update' : 'Create' }} seat</h1>
						<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
					</div>
					<div class="modal-body">
						<form [formGroup]="seatForm" novalidate>
							<div class="row">
								<div class="col-md-6 mb-3">
									<label>Name *</label>
									<input type="text" class="form-control" [class.is-invalid]="isInvalid('name')" formControlName="name" />
									@if (isInvalid('name')) {
										<div class="invalid-feedback">El nombre es obligatorio.</div>
									}
								</div>
								<div class="col-md-6 mb-3">
									<label>Size</label>
									<input type="number" class="form-control" formControlName="size" />
								</div>
							</div>
							<div class="row">
								<div class="col-md-6 mb-3">
									<label>X</label>
									<input type="number" class="form-control" formControlName="x" />
								</div>
								<div class="col-md-6 mb-3">
									<label>Y</label>
									<input type="number" class="form-control" formControlName="y" />
								</div>
							</div>
							<div class="row">
								<div class="col-md-4 mb-3">
									<label>Color</label>
									<input type="color" class="form-control form-control-color" formControlName="color" />
								</div>
								<div class="col-md-8 mb-3">
									<label>Ícono</label>
									<div class="d-flex gap-2 flex-wrap">
										@for (icon of icons; track icon.value) {
											<button
												type="button"
												class="icon-choice"
												[class.active]="seatForm.controls.icon.value === icon.value"
												(click)="seatForm.patchValue({ icon: icon.value })"
											>
												@if (icon.value) {
													<i class="bi {{ icon.value }}"></i>
												} @else {
													<span class="icon-choice-none">123</span>
												}
												<span class="icon-choice-label">{{ icon.label }}</span>
											</button>
										}
									</div>
								</div>
							</div>
							@if (errorMessage) {
								<div class="text-danger">{{ errorMessage }}</div>
							}
						</form>
					</div>
					<div class="modal-footer">
						<button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
						<button type="button" class="btn btn-danger" (click)="submit()">{{ seat() ? 'Update' : 'Create' }}</button>
					</div>
				</div>
			</div>
		</div>
	`,
	styles: [
		`
			.icon-choice {
				display: flex;
				flex-direction: column;
				align-items: center;
				gap: 4px;
				width: 84px;
				padding: 10px 6px;
				border-radius: 8px;
				border: 1px solid #444;
				background: #1c1f24;
				color: #ccc;
				font-size: 11px;
				cursor: pointer;
			}
			.icon-choice i {
				font-size: 20px;
			}
			.icon-choice-none {
				font-size: 12px;
				font-weight: 700;
				color: #999;
			}
			.icon-choice-label {
				text-align: center;
				line-height: 1.1;
			}
			.icon-choice.active {
				border-color: var(--app-accent);
				background: rgba(var(--app-accent-rgb), 0.15);
				color: #fff;
			}
			.icon-choice.active i,
			.icon-choice.active .icon-choice-none {
				color: var(--app-accent);
			}
		`,
	],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreateSeatModalComponent implements OnChanges {
	private readonly fb = inject(FormBuilder);
	private readonly seatsService = inject(SeatsService);

	@Input() areaId: number | undefined;
	@Input() coordinates: { x: number; y: number } | undefined;

	seat = model<Seat | null>(null);
	seatCreated = output<Seat>();
	seatUpdated = output<Seat>();
	errorMessage = '';

	// Solo lo que realmente se usa para armar un mapa: mesas (redonda/rectangular) y asientos sueltos.
	// Antes había opciones genéricas (Chair/Star/Check) sin relación con lo que se está diseñando acá.
	icons = [
		{ label: 'Solo número', value: '' },
		{ label: 'Mesa redonda', value: 'bi-circle-fill' },
		{ label: 'Mesa rectangular', value: 'bi-square-fill' },
		{ label: 'Asiento', value: 'bi-person-fill' },
	];

	seatForm = this.fb.group({
		name: ['', Validators.required],
		size: [12, Validators.required],
		x: [0, Validators.required],
		y: [0, Validators.required],
		color: ['#000000', Validators.required],
		icon: [''],
	});

	constructor() {
		effect(() => {
			this.errorMessage = '';
			const current = this.seat();
			if (current) {
				this.seatForm.patchValue({
					name: current.name,
					size: current.size,
					x: current.x,
					y: current.y,
					color: current.color,
					icon: current.icon,
				});
			}
		});
	}

	ngOnChanges(): void {
		if (this.coordinates && !this.seat()) {
			this.seatForm.patchValue({ x: this.coordinates.x, y: this.coordinates.y });
		}
	}

	isInvalid(controlName: keyof typeof this.seatForm.controls): boolean {
		const control = this.seatForm.controls[controlName];
		return control.invalid && control.touched;
	}

	submit() {
		if (this.seatForm.invalid || !this.areaId) {
			this.seatForm.markAllAsTouched();
			return;
		}

		const value = this.seatForm.getRawValue();
		const payload = {
			name: value.name!,
			size: value.size!,
			x: value.x!,
			y: value.y!,
			color: value.color!,
			icon: value.icon ?? '',
			areaId: this.areaId,
		};

		const current = this.seat();
		const request = current ? this.seatsService.updateSeat(current.id, payload) : this.seatsService.createSeat(payload);

		request.subscribe({
			next: (seat) => {
				if (current) {
					this.seatUpdated.emit(seat);
				} else {
					this.seatCreated.emit(seat);
				}
				this.seat.set(null);
				this.seatForm.reset({ color: '#000000', size: 12, x: 0, y: 0 });
				this.errorMessage = '';
				closeModal('createSeatModal');
			},
			error: (err: HttpErrorResponse) => {
				this.errorMessage = extractErrorMessage(err);
			},
		});
	}
}
