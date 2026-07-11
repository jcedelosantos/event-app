import { ChangeDetectionStrategy, Component, Input, OnChanges, OnInit } from '@angular/core';
import { generateFullCalendarMatrix } from '../../utils/schedule';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Events } from '../../models/events/events';

@Component({
	selector: 'app-schedule',
	imports: [CommonModule, ReactiveFormsModule, RouterLink],
	template: `
		<div class="col-12 schedule-box">
			<form [formGroup]="form" (ngSubmit)="onSubmit()">
				<div class="p-2">
					<h5>Schedule</h5>
				</div>
				<div class="col ps-2 pe-2 pb-3">
					<div class="row g-2">
						<div class="col-4">
							<input type="number" min="2000" max="2100" class="form-control form-control-sm" formControlName="filterYear" />
						</div>
						<div class="col-6">
							<select class="form-select form-select-sm" aria-label="Default select example" formControlName="filterMonth" required="">
								@for (month of months; track $index; let idx = $index) {
									<option [value]="idx">{{ month }}</option>
								}
							</select>
						</div>
						<div class="col-2">
							<button type="submit" [disabled]="form.invalid" class="btn btn-danger btn-sm"><i class="bi bi-arrow-clockwise"></i></button>
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
													<button type="button" class="'btn btn btn-primary btn-sm" (click)="add(idy, idx)">{{ day.day }}</button>
												} @else if (rangerDayLast.y === idy && rangerDayLast.x <= idx && rangerDayInit.x >= idx) {
													<button type="button" class="'btn btn btn-primary btn-sm" (click)="add(idy, idx)">{{ day.day }}</button>
												} @else {
													<button type="button" [class]="this.day !== day.day ? 'btn btn-dark btn-sm' : 'btn btn-danger btn-sm'" (click)="add(idy, idx)">{{ day.day }}</button>
												}
											}

											@if (rangerDayInit.y < rangerDayLast.y) {
												@if (rangerDayInit.y === idy && rangerDayInit.x <= idx) {
													<button type="button" class="'btn btn btn-primary btn-sm" (click)="add(idy, idx)">{{ day.day }}</button>
												} @else if (rangerDayLast.y === idy && rangerDayLast.x >= idx) {
													<button type="button" class="'btn btn btn-primary btn-sm" (click)="add(idy, idx)">{{ day.day }}</button>
												} @else if (rangerDayInit.y < idy && rangerDayLast.y > idy) {
													<button type="button" class="'btn btn btn-primary btn-sm" (click)="add(idy, idx)">{{ day.day }}</button>
												} @else {
													<button type="button" [class]="this.day !== day.day ? 'btn btn-dark btn-sm' : 'btn btn-danger btn-sm'" (click)="add(idy, idx)">{{ day.day }}</button>
												}
											}

											@if (rangerDayInit.y > rangerDayLast.y) {
												@if (rangerDayLast.y === idy && rangerDayLast.x <= idx) {
													<button type="button" class="'btn btn btn-primary btn-sm" (click)="add(idy, idx)">{{ day.day }}</button>
												} @else if (rangerDayInit.y === idy && rangerDayInit.x >= idx) {
													<button type="button" class="'btn btn btn-primary btn-sm" (click)="add(idy, idx)">{{ day.day }}</button>
												} @else if (rangerDayLast.y < idy && rangerDayInit.y > idy) {
													<button type="button" class="'btn btn btn-primary btn-sm" (click)="add(idy, idx)">{{ day.day }}</button>
												} @else {
													<button type="button" [class]="this.day !== day.day ? 'btn btn-dark btn-sm' : 'btn btn-danger btn-sm'" (click)="add(idy, idx)">{{ day.day }}</button>
												}
											}
										@if (day.inMonth && hasEvent(day.day)) {
											<span class="event-dot"></span>
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
						<input type="text" class="form-control form-control-sm" formControlName="filterHourInit" />
					</div>
					_
					<div class="col-3">
						<input type="text" class="form-control form-control-sm" formControlName="filterHourLast" />
					</div>
					<div class="col-3"></div>
				</div>
				<div class="col-12">
					<div class="d-flex justify-content-start">
						<div class="p-2">
							<h5>List events</h5>
						</div>
						<div class="p-2">
							<span class="badge text-bg-danger">{{ monthEvents().length }}</span>
						</div>
					</div>

					<div class="col-12">
						<div class="scroll-events">
							@if (!monthEvents().length) {
								<p class="text-body-secondary">No hay eventos este mes.</p>
							}
							@for (event of monthEvents(); track event.id) {
								<div class="card">
									<div class="card-header">{{ event.name }}</div>
									<ul class="list-group list-group-flush">
										<li class="list-group-item">
											<div class="d-flex justify-content-between">
												<div class="p-2">{{ event.dateOn.toISOString().split('T')[0] }}</div>
												<div class="p-2">{{ event.type }}</div>
											</div>
										</li>
										<li class="list-group-item">
											<div class="d-flex justify-content-between">
												<div class="p-2">Cupo : <span class="badge text-bg-warning">{{ totalCount(event) }}</span></div>
												<div class="p-2">
													<a class="btn btn-danger btn-sm" [routerLink]="['/manager/events', event.id]">Details</a>
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
export class ScheduleComponent implements OnInit, OnChanges {
	@Input() events: Events[] = [];

	dayList: string[] = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
	months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
	year: number;
	month: number;
	day: number;

	dayIndex: number;

	calendar: { day: number; inMonth: boolean }[][] = [];
	eventDaysInMonth = new Set<number>();
	monthEventsValue: Events[] = [];

	rangerDayInit: { y: number; x: number };
	rangerDayLast: { y: number; x: number };

	form: any;

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

	private autoJumped = false;

	ngOnInit() {
		this.refreshCalendar();
	}

	ngOnChanges() {
		// La primera vez que llegan eventos reales, si el mes actual no tiene ninguno, saltamos al
		// mes del evento más cercano — si no, el calendario arranca vacío en "hoy" y da la falsa
		// impresión de que ningún evento de prueba quedó registrado.
		if (!this.autoJumped && this.events.length) {
			this.autoJumped = true;
			const monthHasEvents = this.events.some((e) => e.dateOn.getUTCFullYear() === this.year && e.dateOn.getUTCMonth() === this.month);
			if (!monthHasEvents) {
				const sorted = [...this.events].sort((a, b) => a.dateOn.getTime() - b.dateOn.getTime());
				const now = Date.now();
				const nearest = sorted.find((e) => e.dateOn.getTime() >= now) ?? sorted[sorted.length - 1];
				if (nearest) {
					this.year = nearest.dateOn.getUTCFullYear();
					this.month = nearest.dateOn.getUTCMonth();
					this.form.patchValue({ filterYear: this.year, filterMonth: this.month });
				}
			}
		}
		this.refreshCalendar();
	}

	monthEvents() {
		return this.monthEventsValue;
	}

	hasEvent(day: number): boolean {
		return this.eventDaysInMonth.has(day);
	}

	totalCount(event: Events): number {
		return event.tickets.reduce((sum, ticket) => sum + ticket.count, 0);
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
			this.year = Number(this.form.value.filterYear);
			this.month = Number(this.form.value.filterMonth);
			this.refreshCalendar();
		}
	}

	private refreshCalendar() {
		this.calendar = generateFullCalendarMatrix(this.year, this.month);
		// e.dateOn es un instante UTC medianoche que representa un día calendario: se lee con
		// getters UTC para no perder un día en timezones detrás de UTC (ver utils/dates.ts).
		this.monthEventsValue = this.events
			.filter((e) => e.dateOn.getUTCFullYear() === this.year && e.dateOn.getUTCMonth() === this.month)
			.sort((a, b) => a.dateOn.getTime() - b.dateOn.getTime());
		this.eventDaysInMonth = new Set(this.monthEventsValue.map((e) => e.dateOn.getUTCDate()));
	}
}
