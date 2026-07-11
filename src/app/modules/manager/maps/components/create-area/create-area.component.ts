import { ChangeDetectionStrategy, Component, EventEmitter, inject, Input, OnChanges, Output } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { Area } from '../../../../../models/maps/area';
import { AreasService } from '../../services/areas.service';
import { extractErrorMessage } from '../../../../../utils/api-error';
import { cleanupOrphanedModalBackdrop } from '../../../../../utils/modal';

@Component({
	selector: 'create-area',
	imports: [ReactiveFormsModule],
	template: ` <div class="modal fade" id="createAreaModal" data-bs-backdrop="static" data-bs-keyboard="false" tabindex="-1" aria-labelledby="createAreaModalLabel" aria-hidden="true">
		<div class="modal-dialog modal-dialog-scrollable modal-lg">
			<div class="modal-content">
				<form [formGroup]="areaCreateForm" (ngSubmit)="clickPostAreaCreate()">
					<div class="modal-header">
						<h4>Create Area</h4>
					</div>
					<div class="modal-body">
						<p class="text-muted">Un área es una zona de tu venue (ej. "VIP", "Platea", "General") donde después vas a poder agregar asientos o mesas.</p>
						<div class="mb-3">
							<h6>Nombre *</h6>
							<input type="text" maxlength="40" class="form-control" [class.is-invalid]="isInvalid('editName')" formControlName="editName" placeholder="Ej: VIP, Platea, General..." />
							@if (isInvalid('editName')) {
								<div class="invalid-feedback">El nombre es obligatorio (máx. 40 caracteres).</div>
							}
						</div>

						<div class="mb-3">
							<h6>Descripción</h6>
							<input type="text" class="form-control" formControlName="editDescription" maxlength="100" placeholder="Opcional" />
						</div>

						<button class="btn btn-link ps-0" type="button" data-bs-toggle="collapse" data-bs-target="#createAreaAdvanced">
							Personalizar apariencia (opcional) <i class="bi bi-chevron-down"></i>
						</button>
						<div class="collapse" id="createAreaAdvanced">
							<div class="row border-top pt-3 mt-1">
								<div class="col-md-2 mb-2">
									<h6>X</h6>
									<input type="number" min="0" max="10000" class="form-control" formControlName="editX" placeholder="0.0" />
								</div>

								<div class="col-md-2 mb-2">
									<h6>Y</h6>
									<input type="number" min="0" max="10000" class="form-control" formControlName="editY" placeholder="0.0" />
								</div>

								<div class="col-md-2 mb-2">
									<h6>Size</h6>
									<input type="number" min="1" max="32" class="form-control" formControlName="editSize" placeholder="0" />
								</div>

								<div class="col-md-6 mb-2">
									<div class="row">
										<div class="col-4">
											<label for="colorInput" class="form-label">Text</label>
											<input type="color" class="form-control form-control-color" id="colorInput" formControlName="editColor" />
										</div>
										<div class="col-8">
											<label for="colorBackInput" class="form-label">BackGround</label>
											<input type="color" class="form-control form-control-color" id="colorBackInput" formControlName="editBackGround" />
										</div>
									</div>
								</div>

								<div class="col-md-4 mb-2">
									<div class="form-group">
										<label for="editIcons">Icons</label>
										<div class="row p-2">
											<div class="col-8">
												<select id="editIcon" class="form-control " name="editIcon" formControlName="editIcon" (change)="getIcon()">
													@for (icon of icons; track $index) {
														<option [value]="icon.value">
															{{ icon.label }}
														</option>
													}
												</select>
											</div>
											<div class="col-4 mt-2">
												@if (selectedIcon) {
													<i class="bi {{ selectedIcon }}"></i>
												} @else {
													<i class="bi bi-dash-lg"></i>
												}
											</div>
										</div>
									</div>
								</div>

								<div class="col-md-8 mb-2">
									<label for="editImg" class="form-label">Image URL</label>
									<input class="form-control" type="text" id="editImg" formControlName="editImg" placeholder="https://..." />
								</div>
							</div>
						</div>
						@if (errorMessage) {
							<div class="text-danger">{{ errorMessage }}</div>
						}
					</div>
					<div class="modal-footer">
						<button type="button" class="btn btn-secondary" (click)="closeModal()">Cerrar</button>
						<button type="submit" class="btn btn-primary">Create</button>
					</div>
				</form>
			</div>
		</div>
	</div>`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreateAreaComponent implements OnChanges {
	private readonly fb = inject(FormBuilder);
	private readonly areasService = inject(AreasService);

	areaCreateForm: FormGroup;
	errorMessage = '';
	icons = [
		{ label: '', value: '' },
		{ label: 'Curso', value: 'bi-input-cursor' },
		{ label: 'Resize', value: 'bi-textarea-resize' },
		{ label: 'Textarea', value: 'bi-textarea' },
		{ label: 'Map', value: 'bi bi-map' },
		{ label: 'Geo', value: 'bi-geo' },
		{ label: 'Table', value: 'bi-table' },
		{ label: 'Bank', value: 'bi-bank' },
	];
	selectedIcon: string = this.icons[0].value;

	@Input()
	modal: any;
	@Input()
	coordinates: { y: number; x: number } | undefined;
	@Input()
	mapId: number | undefined;

	@Output()
	createAreaEvent = new EventEmitter<{ createArea: Area }>();

	constructor() {
		this.areaCreateForm = this.initFormat();
	}

	ngOnChanges(): void {
		if (this.coordinates) {
			this.areaCreateForm.get('editX')?.setValue(this.coordinates.x);
			this.areaCreateForm.get('editY')?.setValue(this.coordinates.y);
		}
	}

	initFormat() {
		return this.fb.group({
			editName: ['', Validators.required],
			editImg: [''],
			editDescription: [''],
			editColor: ['#000000', Validators.required],
			editBackGround: ['#ffffff', Validators.required],
			editIcon: [''],
			editSize: [12, Validators.required],
			editX: [0, Validators.required],
			editY: [0, Validators.required],
		});
	}

	clickPostAreaCreate() {
		this.postCreateArea();
	}

	closeModal() {
		this.modal.hide();
		cleanupOrphanedModalBackdrop();
	}

	getIcon() {
		this.selectedIcon = this.areaCreateForm.get('editIcon')?.value;
	}

	isInvalid(controlName: string): boolean {
		const control = this.areaCreateForm.get(controlName);
		return !!control && control.invalid && control.touched;
	}

	postCreateArea() {
		if (this.areaCreateForm.invalid || !this.mapId) {
			this.areaCreateForm.markAllAsTouched();
			return;
		}

		const value = this.areaCreateForm.getRawValue();
		this.areasService
			.createArea({
				name: value.editName,
				description: value.editDescription ?? '',
				img: value.editImg ?? '',
				icon: value.editIcon ?? '',
				x: value.editX,
				y: value.editY,
				size: value.editSize,
				color: value.editColor,
				backGround: value.editBackGround,
				mapId: this.mapId,
			})
			.subscribe({
				next: (area) => {
					this.createAreaEvent.emit({ createArea: area });
					this.areaCreateForm = this.initFormat();
					this.errorMessage = '';
					this.closeModal();
				},
				error: (err: HttpErrorResponse) => {
					this.errorMessage = extractErrorMessage(err);
				},
			});
	}
}
