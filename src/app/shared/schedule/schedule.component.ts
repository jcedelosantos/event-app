import { ChangeDetectionStrategy, Component } from '@angular/core';
import { generateFullCalendarMatrix } from '../../utils/schedule';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { CommonModule } from '@angular/common';

@Component({
	selector: 'app-schedule',
	imports: [CommonModule, ReactiveFormsModule],
	template: `
		<div class="col-12 schedule-box">
			<form [formGroup]="form" (ngSubmit)="onSubmit()">
				<div class="p-2">
					<h5>Schedule</h5>
				</div>
				<div class="col ps-2 pe-2 pb-4">
					<div class="row">
						<div class="col-4">
							<input type="number" min="2000" max="2100" class="form-control" formControlName="filterYear" />
						</div>
						<div class="col-6">
							<select class="form-select" aria-label="Default select example" formControlName="filterMonth" required="">
								@for (month of months; track $index; let idx = $index) {
									<option [value]="idx">{{ month }}</option>
								}
							</select>
						</div>
						<div class="col-2">
							<button type="submit" [disabled]="form.invalid" class="btn btn-danger"><i class="bi bi-arrow-clockwise"></i></button>
						</div>
					</div>
				</div>

				<div class="col-12 ps-2 pe-2 pb-4">
					<table class="calendar">
						<thead>
							<tr>
								@for (dayName of dayList; track dayName; let idx = $index) {
									<th [class]="idx === dayIndex ? 'text-danger' : 'text-secondary'">
										{{ dayName }}
									</th>
								}
							</tr>
						</thead>
						<tbody>
							@for (week of calendar; track $index; let idy = $index) {
								<tr>
									@for (day of week; track $index; let idx = $index) {
										<td [class.out]="!day.inMonth">
											@if (rangerDayInit.y === rangerDayLast.y) {
												@if (rangerDayInit.y === idy && rangerDayInit.x <= idx && rangerDayLast.x >= idx) {
													<button type="button" class="'btn btn btn-primary" (click)="add(idy, idx)">{{ day.day }}</button>
												} @else if (rangerDayLast.y === idy && rangerDayLast.x <= idx && rangerDayInit.x >= idx) {
													<button type="button" class="'btn btn btn-primary" (click)="add(idy, idx)">{{ day.day }}</button>
												} @else {
													<button type="button" [class]="this.day !== day.day ? 'btn btn-dark' : 'btn btn-danger'" (click)="add(idy, idx)">{{ day.day }}</button>
												}
											}

											@if (rangerDayInit.y < rangerDayLast.y) {
												@if (rangerDayInit.y === idy && rangerDayInit.x <= idx) {
													<button type="button" class="'btn btn btn-primary" (click)="add(idy, idx)">{{ day.day }}</button>
												} @else if (rangerDayLast.y === idy && rangerDayLast.x >= idx) {
													<button type="button" class="'btn btn btn-primary" (click)="add(idy, idx)">{{ day.day }}</button>
												} @else if (rangerDayInit.y < idy && rangerDayLast.y > idy) {
													<button type="button" class="'btn btn btn-primary" (click)="add(idy, idx)">{{ day.day }}</button>
												} @else {
													<button type="button" [class]="this.day !== day.day ? 'btn btn-dark' : 'btn btn-danger'" (click)="add(idy, idx)">{{ day.day }}</button>
												}
											}

											@if (rangerDayInit.y > rangerDayLast.y) {
												@if (rangerDayLast.y === idy && rangerDayLast.x <= idx) {
													<button type="button" class="'btn btn btn-primary" (click)="add(idy, idx)">{{ day.day }}</button>
												} @else if (rangerDayInit.y === idy && rangerDayInit.x >= idx) {
													<button type="button" class="'btn btn btn-primary" (click)="add(idy, idx)">{{ day.day }}</button>
												} @else if (rangerDayLast.y < idy && rangerDayInit.y > idy) {
													<button type="button" class="'btn btn btn-primary" (click)="add(idy, idx)">{{ day.day }}</button>
												} @else {
													<button type="button" [class]="this.day !== day.day ? 'btn btn-dark' : 'btn btn-danger'" (click)="add(idy, idx)">{{ day.day }}</button>
												}
											}
										</td>
									}
								</tr>
							}
						</tbody>
					</table>
				</div>
				<div class="row pb-2">
					<div class="col-3"></div>
					<div class="col-3">
						<input type="text" class="form-control" formControlName="filterHourInit" />
					</div>
					_
					<div class="col-3">
						<input type="text" class="form-control" formControlName="filterHourLast" />
					</div>
					<div class="col-3"></div>
				</div>
				<div class="col-12">
					<div class="d-flex justify-content-start">
						<div class="p-2">
							<h5>List events</h5>
						</div>
						<div class="p-2">
							<span class="badge text-bg-danger">{{ listEvents.length + 1 }}</span>
						</div>
					</div>

					<div class="col-12">
						<div class="scroll-events">
							@for (event of listEvents; track $index; let idx = $index) {
								<div class="card">
									<div class="card-header">Event {{ event }}</div>
									<ul class="list-group list-group-flush">
										<li class="list-group-item">
											<div class="d-flex justify-content-between">
												<div class="p-2">2025 May, 20</div>
												<div class="p-2">7:00 AM - 10:00 PM</div>
											</div>
										</li>
										<li class="list-group-item">
											<div class="progress" role="progressbar" aria-label="Example with label" aria-valuenow="25" aria-valuemin="0" aria-valuemax="100">
												<div class="progress-bar" style="width: 25%">25%</div>
											</div>
										</li>
										<li class="list-group-item">
											<div class="d-flex justify-content-between">
												<div class="p-2">Tickets : <span class="badge text-bg-warning"> 20 / 100</span></div>
												<div class="p-2">
													<button type="button" class="btn btn-danger btn-sm">Dealtis</button>
												</div>
											</div>
										</li>
									</ul>
								</div>
								<br />
							}
						</div>
					</div>
				</div>
			</form>
		</div>
	`,
	styleUrl: './schedule.component.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScheduleComponent {
	dayList: string[] = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
	months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
	year: number;
	month: number;
	day: number;

	dayIndex: number;

	calendar: { day: number; inMonth: boolean }[][] = [];

	rangerDayInit: { y: number; x: number };
	rangerDayLast: { y: number; x: number };

	form: any;

	listEvents = [1, 2, 3, 4, 5, 6, 7];

	constructor(private fb: FormBuilder) {
		const date = new Date();
		this.year = date.getFullYear();
		this.month = date.getMonth();
		this.day = date.getDate();
		this.dayIndex = date.getDay();

		this.rangerDayInit = { y: -1, x: -1 };
		this.rangerDayLast = { y: -1, x: -1 };

		this.form = this.fb.nonNullable.group({
			filterHourInit: ['7:00 AM', [Validators.required]],
			filterHourLast: ['10:00 PM', [Validators.required]],
			filterMonth: [this.month, Validators.required],
			filterYear: [this.year, [Validators.required]],
		});
	}

	ngOnInit() {
		this.calendar = generateFullCalendarMatrix(this.year, this.month);
		console.log(this.calendar);
	}

	add(y: number, x: number) {
		if (this.rangerDayInit.y === -1 && this.rangerDayLast.y === -1) {
			this.rangerDayInit = { y, x };
			this.rangerDayLast = { y, x };
		} else {
			this.rangerDayInit = this.rangerDayLast;
			this.rangerDayLast = { y, x };
			if (this.rangerDayInit.y == this.rangerDayLast.y && this.rangerDayInit.x == this.rangerDayLast.x) {
				this.rangerDayInit = { y: -1, x: -1 };
				this.rangerDayLast = { y: -1, x: -1 };
			}
		}
	}
	onSubmit() {
		if (this.form.valid) {
			console.log('Form submitted:', this.form.value);
		}
	}
}
