import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';

import { tickets } from '../../../data/tickets';
import { Ticket } from '../../../models/tickets/ticket';

import { TicketCardComponent } from './components/ticket-card/ticket-card.component';
import { CreaterTicketModalComponent } from './components/creater-ticket-modal/creater-ticket-modal.component';

import { ExportTicketsModalComponent } from './components/export-tickets-modal/export-tickets-modal.component';
import { ImportTicketsModalComponent } from './components/import-tickets-modal/import-tickets-modal.component';

@Component({
	selector: 'app-tickets',
	imports: [TicketCardComponent, CreaterTicketModalComponent, ExportTicketsModalComponent, ImportTicketsModalComponent],
	template: `
		<br />
		<br />
		<h2>Tickets Manager</h2>
		<br />

		<nav class="navbar border-bottom border-body">
			<div class="container-fluid">
				<form class="d-flex" role="search">
					<button type="button" class="btn btn-danger  me-4" data-bs-toggle="modal" data-bs-target="#createTicketModal">Create</button>
					<input class="form-control me-2" type="search" placeholder="Search" aria-label="Name" />
					<button class="btn btn-dark me-4" type="submit">Search</button>
				</form>
				<div class="navbar-brand">
					<div class="row">
						<div class="col">
							<i class="bi bi-arrow-up-circle-fill" data-bs-toggle="modal" data-bs-target="#importTicketsModal"></i>
						</div>
						<div class="col">
							<i class="bi bi-arrow-down-circle-fill" data-bs-toggle="modal" data-bs-target="#exportTicketsModal"></i>
						</div>
					</div>
				</div>
			</div>
		</nav>
		<br />
		@if (tickets) {
			<div class="row">
				@for (ticket of tickets; track ticket.id) {
					<div class="col-xxl-3 col-xl-4 col-lg-12 col-md-12 col-sm-12 col-12 ">
						<ticket-card [ticket]="ticket" />
					</div>
				}
			</div>
		}
		<app-creater-ticket-modal />
		<app-export-tickets-modal />
		<app-import-tickets-modal />
	`,
	styleUrl: './tickets.component.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TicketsComponent implements OnInit {
	tickets: Array<Ticket> | undefined;

	constructor() {}
	ngOnInit(): void {
		this.tickets = tickets;
	}
}
