import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';

import { ActivatedRoute, Router } from '@angular/router';
import { Events } from '../../../../models/events/events';
import { EventsService } from '../services/events.service';
import { User } from '../../../../models/users/user';
import { mockUsers } from '../../../../data/mock-users';

import { maps } from '../../../../data/map';
import { Map } from '../../../../models/maps/map';

import { QRCodeComponent } from 'angularx-qrcode';
import { CardMapComponent } from '../../maps/components/card-map/card-map.component';

@Component({
	selector: 'app-event-details',
	imports: [QRCodeComponent, CardMapComponent],
	template: `
		<h4 class="pb-2">
			{{ event().name }}
		</h4>

		<div class="row">
			@for (s of status; track $index; let i = $index) {
				<div class="col-3">
					<div class="card">
						<div class="card-body">
							<div class="d-flex flex-row mb-3 justify-content-between">
								<div class="p-2">{{ s.key }}</div>
								<div class="p-2">{{ s.value }}</div>
							</div>

							<div class="progress" role="progressbar" aria-label="Basic example" aria-valuenow="25" aria-valuemin="0" aria-valuemax="100" style="height: 8px;">
								<div class="progress-bar" style="width: 25%"></div>
							</div>
						</div>
					</div>
				</div>
			}
		</div>
		<br />

		<div class="row">
			<div class="col-11">
				<div class="card">
					<div class="card-body">
						<h6>Details</h6>
						<p>{{ event().description }}</p>
					</div>
				</div>
			</div>
			<div class="col-1"><qrcode [qrdata]="event().code" [width]="100" [errorCorrectionLevel]="'M'"></qrcode></div>
		</div>

		<br />
		<div class="row">
			<!-- <div class="col-6">graf</div> -->
		</div>

		<div class="row">
			@if (maps) {
				<div class="col-8">
					<card-map [map]="maps[0]" />
				</div>
			}

			<div class="col-4">
				<div class="card">
					<div class="card-body">
						<h5>Information</h5>
						<hr />

						<div class="d-flex flex-row mb-3 justify-content-between">
							<div class="p-1">Created</div>
							<div class="p-1">{{ event().dateSale.toISOString() }}</div>
						</div>
						<div class="d-flex flex-row mb-3 justify-content-between">
							<div class="p-1">Start</div>
							<div class="p-1">{{ event().dateOn.toISOString() }}</div>
						</div>
						<div class="d-flex flex-row mb-3 justify-content-between">
							<div class="p-1">End</div>
							<div class="p-1">{{ event().dateOff.toISOString() }}</div>
						</div>
						<hr />

						<div class="d-flex flex-row mb-3 justify-content-between">
							<div class="p-2">Status</div>
							<div class="p-2">{{ event().active }}</div>
						</div>
						<hr />

						<div class="d-flex flex-row mb-3 justify-content-between">
							<div class="p-1">Type</div>
							<div class="p-1">{{ event().type }}</div>
						</div>

						<div class="d-flex flex-row mb-3 justify-content-between">
							<div class="p-1">Areas:</div>
							<div class="p-1">{{ event().areas.length }}</div>
						</div>
						<hr />

						<div class="d-flex flex-row mb-3 justify-content-between">
							<div class="p-1">tickets:</div>
							@for (ticket of event().tickets; track $index; let i = $index) {
								<div class="p-1">{{ ticket.type }}</div>
							}
						</div>
					</div>
				</div>
			</div>
		</div>
		<hr />
		<div class="col-12">
			<div class="row">
				<div class="col-8">
					<h5>Registered Users</h5>
				</div>
				<div class="col-4">
					<form class="d-flex justify-content-end" role="search">
						<input class="form-control me-2" type="search" placeholder="Search" aria-label="Name" />
						<button class="btn btn-dark me-4" type="submit">Search</button>
					</form>
				</div>
			</div>
			<br />
			<div class="card">
				<div class="card-body">
					<table class="table table-striped-columns">
						<thead>
							<tr>
								<th scope="col">#</th>
								<th scope="col">User</th>
								<th scope="col">Name</th>
								<th scope="col">Last</th>
								<th scope="col">Carnet</th>
								<th scope="col">Email</th>
								<th scope="col">Phone</th>
								<th scope="col">Gender</th>
							</tr>
						</thead>
						<tbody>
							@for (user of users(); track $index; let i = $index) {
								<tr>
									<th scope="row">{{ i + 1 }}</th>
									<td>{{ user.username }}</td>
									<td>{{ user.name }}</td>
									<td>{{ user.lastname }}</td>
									<td>{{ user.carnet }}</td>
									<td>{{ user.email }}</td>
									<td>{{ user.phone }}</td>
									<td>{{ user.gender }}</td>
								</tr>
							}
						</tbody>
					</table>
				</div>
			</div>
		</div>
	`,
	styleUrl: './event-details.component.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventDetailsComponent implements OnInit {
	private readonly activatedRoute = inject(ActivatedRoute);
	private readonly router = inject(Router);

	private readonly eventSrv = inject(EventsService);

	event = signal<Events>(this.eventSrv.mockEvents());

	users = signal<User[]>(mockUsers());

	id: string | null = '';

	status: { key: string; value: string }[] = [
		{
			key: 'Income',
			value: '$ 37,000.00',
		},
		{
			key: 'Tickets sold',
			value: '200',
		},
		{
			key: 'Income Products',
			value: '$ 200,000.00',
		},
		{
			key: 'Income',
			value: '$ 37,000.00',
		},
	];
	maps: Array<Map> | undefined;

	ngOnInit(): void {
		this.activatedRoute.paramMap.subscribe((params) => {
			this.id = params.get('id_event');
			if (this.id) {
				console.log(this.id);
			} else {
				this['router'].navigate(['/manager/events']);
			}
		});
		this.maps = maps;
	}
}
