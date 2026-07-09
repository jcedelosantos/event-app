import { ChangeDetectionStrategy, Component, effect, inject, Input, model, OnChanges, output } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { Seat } from '../../../../../models/maps/seat';
import { SeatsService } from '../../services/seats.service';

declare const bootstrap: any;

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
									<label>Name</label>
									<input type="text" class="form-control" formControlName="name" />
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
								<div class="col-md-6 mb-3">
									<label>Color</label>
									<input type="color" class="form-control form-control-color" formControlName="color" />
								</div>
								<div class="col-md-6 mb-3">
									<label>Icon</label>
									<select class="custom-select d-block w-100" formControlName="icon">
										@for (icon of icons; track $index) {
											<option [value]="icon.value">{{ icon.label }}</option>
										}
									</select>
								</div>
							</div>
							@if (errorMessage) {
								<div class="text-danger">{{ errorMessage }}</div>
							}
						</form>
					</div>
					<div class="modal-footer">
						<button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
						<button type="button" class="btn btn-danger" [disabled]="seatForm.invalid" (click)="submit()">{{ seat() ? 'Update' : 'Create' }}</button>
					</div>
				</div>
			</div>
		</div>
	`,
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

	icons = [
		{ label: '', value: '' },
		{ label: 'Chair', value: 'bi-person-fill' },
		{ label: 'Star', value: 'bi-star-fill' },
		{ label: 'Check', value: 'bi-check-circle-fill' },
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
				const modalEl = document.getElementById('createSeatModal');
				if (modalEl) {
					bootstrap.Modal.getOrCreateInstance(modalEl).hide();
				}
			},
			error: (err: HttpErrorResponse) => {
				this.errorMessage = err.error?.error ?? err.message;
			},
		});
	}
}
