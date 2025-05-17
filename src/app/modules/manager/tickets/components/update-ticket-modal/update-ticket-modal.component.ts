import { ChangeDetectionStrategy, Component, effect, model, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Ticket } from '../../../../../models/tickets/ticket';

@Component({
	selector: 'app-update-ticket-modal',
	imports: [ReactiveFormsModule],
	template: ` <div class="modal fade" id="updateTicketModal" tabindex="-1" aria-labelledby="updateTicketModalLabel" aria-hidden="true">
		<div class="modal-dialog">
			<div class="modal-content">
				<div class="modal-header">
					<h1 class="modal-title fs-5" id="updateTicketModalLabel">{{(ticket()?.id ?? 0) > 0 ? 'Update' : 'Create'}} ticket</h1>
					<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
				</div>
				<div class="modal-body">
					<form class="needs-validation" novalidate="" [formGroup]="form">
						<div class="row">
							<div class="col-md-6 mb-3">
								<label for="name">Name </label>
								<input type="text" class="form-control" formControlName="name" />
							</div>
							<div class="col-md-6 mb-3">
								<label for="code">Code </label>
								<input type="text" class="form-control"  formControlName="code" />
							</div>
						</div>
						<div class="mb-3">
							<label for="description">Description </label>
							<input type="text" class="form-control"  formControlName="description" />
						</div>
						<div class="row">
							<div class="col-md-6 mb-3">
								<label for="count">Count</label>
								<input type="number" class="form-control" formControlName="count" />
								<!-- <div class="invalid-feedback">Valid first name is required.</div> -->
							</div>
							<div class="col-md-6 mb-3">
								<label for="price">Price</label>
								<input type="number" class="form-control" formControlName="price" />
							</div>
						</div>

						<div class="row">
							<div class="col-md-6 mb-3">
								<label for="type">Type</label>
								<select class="custom-select d-block w-100" formControlName="type">
									@for (type of typeList(); track type) {
										<option [ngValue]="type">type</option>
									}
								</select>
								<!-- <div class="invalid-feedback">Please select a valid country.</div> -->
							</div>
							<div class="col-md-6 mb-3">
								<label for="state">Status</label>
								<select class="custom-select d-block w-100" formControlName="active">
									@for (status of activeList(); track status) {
										<option [ngValue]="status.value">{{status.label}}</option>
									}
								</select>
								<!-- <div class="invalid-feedback">Please provide a valid state.</div> -->
							</div>
						</div>
					</form>
				</div>
				<div class="modal-footer">
					<button type="button" class="btn btn-secondary btn-sm" data-bs-dismiss="modal"><i class="bi bi-x-lg"></i> Close</button>
					<button type="button" class="btn btn-primary btn-sm"> <i class="bi bi-floppy-fill" aria-hidden="true"></i> Update</button>
				</div>
			</div>
		</div>
	</div>`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UpdateTicketModalComponent {

	ticket = model<Ticket | null>(null)

	typeList = signal<string[]>(['VIP', 'Normal'])
	activeList = signal<{ label: string, value: boolean | null }[]>([
		{ label: 'Active', value: true },
		{ label: 'Inactive', value: false }
	])

	form = new FormGroup({
		id: new FormControl<number>(0, [Validators.required]),
		img: new FormControl<string | null>(''),
		code: new FormControl<string>('', [Validators.required]),
		name: new FormControl<string | null>(null, Validators.required),
		description: new FormControl<string | null>(null, Validators.required),
		type: new FormControl<string | null>(null, Validators.required),
		count: new FormControl<number | null>(null, Validators.required),
		active: new FormControl<boolean>(true, [Validators.required]),
		price: new FormControl<number | null>(null, Validators.required),
		date: new FormControl<string | null>(null, Validators.required),
	});

	constructor() {
		effect(() => {
			if (this.ticket()) {
				this.setForm();
			} else {
				this.form.reset();
			}
		})
	}


	setForm() {
		if (this.ticket()) {
			this.form.patchValue({ ...this.ticket() });
		}
	}



}
