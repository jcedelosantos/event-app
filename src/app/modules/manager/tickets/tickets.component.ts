import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';

import { Ticket } from '../../../models/tickets/ticket';

import { TicketCardComponent } from './components/ticket-card/ticket-card.component';

import { ExportTicketsModalComponent } from './components/export-tickets-modal/export-tickets-modal.component';
import { ImportTicketsModalComponent } from './components/import-tickets-modal/import-tickets-modal.component';
import { TicketsService } from './services/tickets.service';
import { UpdateTicketModalComponent } from './components/update-ticket-modal/update-ticket-modal.component';
import { confirm, error } from '../../../utils/messages';
import { extractErrorMessage } from '../../../utils/api-error';
import { HttpErrorResponse } from '@angular/common/http';

@Component({
	selector: 'app-tickets',
	imports: [TicketCardComponent, UpdateTicketModalComponent, ExportTicketsModalComponent, ImportTicketsModalComponent],
	template: `
		<h2 class="section-title">Tickets Manager</h2>

		<nav class="navbar border-bottom border-body">
			<div class="container-fluid">
				<form class="d-flex" role="search">
					<button type="button" class="btn btn-danger me-4" (click)="selectedTicket.set(null)" data-bs-toggle="modal" data-bs-target="#updateTicketModal">Create</button>
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
		@if (tickets()) {
			<div class="tickets-grid">
				@for (ticket of tickets(); track ticket.id) {
					<ticket-card [ticket]="ticket" (selectedTicket)="selectedTicket.set($event)" (deleteTicket)="onDeleteTicket($event)" />
				}
			</div>
		}
		<app-update-ticket-modal [ticket]="selectedTicket()" (ticketSaved)="loadTickets()" />
		<app-export-tickets-modal />
		<app-import-tickets-modal />
	`,
	styleUrl: './tickets.component.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TicketsComponent implements OnInit {
	private readonly ticketSrv = inject(TicketsService);

	tickets = signal<Ticket[]>([]);
	selectedTicket = signal<Ticket | null>(null);

	ngOnInit(): void {
		this.loadTickets();
	}

	loadTickets() {
		this.ticketSrv.getTickets().subscribe((tickets) => this.tickets.set(tickets));
	}

	onDeleteTicket(ticket: Ticket) {
		confirm(`¿Eliminar el ticket "${ticket.name}"?`, {
			onConfirm: () => {
				this.ticketSrv.deleteTicket(ticket.id).subscribe({
					next: () => this.loadTickets(),
					error: (err: HttpErrorResponse) => error(extractErrorMessage(err)),
				});
			},
		});
	}
}
