import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { Seat } from '../../../../../models/maps/seat';

@Component({
	selector: 'collapse-seats',
	imports: [],
	template: `
		@if (seats) {
			<div class="d-flex flex-row justify-content-around ">
				<div class="p-2">
					<button class="btn position-relative" type="button" data-bs-toggle="collapse" attr.data-bs-target="#{{ 'collapseSeats-' + id }}" aria-expanded="false">
						Seats
						<span class="badge rounded-pill bg-danger">{{ seats.length }}</span>
					</button>
				</div>
				<div class="p-4">
					<i></i>
				</div>
				<div class="p-2">
					<button type="button" class="btn btn-sm "><i class="bi bi-x-lg"></i></button>
				</div>
			</div>
			<div class="collapse" [id]="'collapseSeats-' + id">
				<ul class="list-group list-group-flush ms-1 me-1">
					@for (seat of seats; track seat.id; let idx = $index) {
						<li class="list-group-item">
							<div class="d-flex justify-content-evenly align-items-center">
								<input class="form-control" type="text" [placeholder]="seat.name" />
								<button type="button" class="btn btn-sm" linkrou><i class="bi bi-x-circle-fill"></i></button>
							</div>
						</li>
					}
				</ul>
			</div>
		}
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CollapseSeatsComponent {
	@Input()
	seats: Array<Seat> = [];
	@Input()
	id: number = 0;
}
