import { ChangeDetectionStrategy, Component, DestroyRef, Input, OnChanges, OnInit, SimpleChanges, computed, inject, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Events } from '../../../../../models/events/events';
import { Ticket } from '../../../../../models/tickets/ticket';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../../../core/services/auth.service';
import { EventsService, LiveEventStats } from '../../services/events.service';

@Component({
	selector: 'event-card',
	standalone: true,
	imports: [CommonModule, RouterLink],
	template: `
		@if (event) {
			<div class="card text-center event-card-fixed" style="min-width: 240px;">
				<div class="card-header py-2">
					<div class="event-name mb-2" [title]="event.name">{{ event.name }}</div>
					<div class="d-flex justify-content-center gap-2">
						<button type="button" class="btn btn-dark btn-sm icon-btn" (click)="showQr.emit(event)" title="Ver QR"><i class="bi bi-qr-code"></i></button>
						<button type="button" class="btn btn-dark btn-sm icon-btn" (click)="editEvent.emit(event)" title="Editar evento"><i class="bi bi-pencil"></i></button>
						<button type="button" class="btn btn-dark btn-sm icon-btn" (click)="duplicateEvent.emit(event)" title="Duplicar evento"><i class="bi bi-copy"></i></button>
						<button type="button" class="btn btn-danger btn-sm icon-btn" (click)="deleteEvent.emit(event)" title="Eliminar evento"><i class="bi bi-trash"></i></button>
					</div>
				</div>
				<div class="card-body py-2">
					<div class="d-flex justify-content-between flex-row small">
						<span class="p-1"> {{ event.dateOn.toISOString().split('T')[0] }}</span>
						@if (event.startTime) {
							<span class="p-1"> {{ event.startTime }}</span>
						}
					</div>
					@if (isScheduled()) {
						<span class="badge text-bg-warning" [title]="'Se publica el ' + (event.publishAt | date: 'dd/MM/yyyy HH:mm')">
							<i class="bi bi-clock-history"></i> Programado
						</span>
					}
					@if (liveStats(); as stats) {
						@if (stats.queueCount > 0 || stats.admittedCount > 0) {
							<span class="badge text-bg-info" [title]="stats.admittedCount + ' admitido(s) ahora mismo'">
								<i class="bi bi-hourglass-split"></i> {{ stats.queueCount }} en fila
							</span>
						}
						@if (stats.totalCapacity > 0) {
							<span
								class="badge"
								[class.text-bg-danger]="stats.availableCount === 0"
								[class.text-bg-warning]="stats.availableCount > 0 && stats.availableCount <= stats.totalCapacity * 0.1"
								[class.text-bg-secondary]="stats.availableCount > stats.totalCapacity * 0.1"
								[title]="stats.soldCount + ' vendido(s) de ' + stats.totalCapacity"
							>
								<i class="bi bi-ticket-perforated"></i> {{ stats.availableCount }} disponibles
							</span>
						}
					}
					<hr class="my-1" />

					<p class="card-text small mb-1 event-description" [title]="event.description">{{ event.description }}</p>
					<p class="card-text small text-body-secondary mb-1 event-description" [title]="event.map?.description">{{ event.map?.description }}</p>
					<div class="d-flex justify-content-start flex-row flex-wrap gap-1">
						@for (ticket of event.tickets; track $index; let idx = $index) {
							<span class="badge rounded-pill text-bg-warning">{{ ticketBadgeLabel(ticket) }}</span>
						}
					</div>
				</div>
				<div class="card-footer text-body-secondary py-2">
					<div class="d-flex justify-content-between flex-row">
						<button class="btn btn-danger btn-sm" [routerLink]="['/manager/qrs']" [queryParams]="{ eventId: event.id }">Sale</button>
						<button class="btn btn-danger btn-sm" [routerLink]="['/manager/events', event.id]">Details</button>
					</div>
				</div>
			</div>
		} @else {
			<div class="text-muted">No event data</div>
		}
	`,
	styleUrl: './event-card.component.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventCardComponent implements OnInit, OnChanges {
	private readonly authService = inject(AuthService);
	private readonly eventsService = inject(EventsService);
	private readonly destroyRef = inject(DestroyRef);

	// Solo los tenants tipo CLUB reemplazan VIP/Normal por Socio/Invitado en la tarjeta — el resto
	// de las organizaciones sigue viendo el nombre real del tipo de ticket.
	isClubTenant = computed(() => this.authService.currentUser()?.tenant?.type === 'CLUB');

	@Input({ required: true })
	event!: Events;

	showQr = output<Events>();
	editEvent = output<Events>();
	duplicateEvent = output<Events>();
	deleteEvent = output<Events>();

	// null mientras no se cargó el primer poll (o si el evento no tiene sala de espera) — los badges del
	// template solo aparecen con datos reales, nunca parpadean un "0 en fila"/"0 disponibles" de arranque.
	liveStats = signal<LiveEventStats | null>(null);
	private waitingRoomPollIntervalId: ReturnType<typeof setInterval> | null = null;

	ngOnInit(): void {
		this.syncWaitingRoomPolling();
		this.destroyRef.onDestroy(() => {
			if (this.waitingRoomPollIntervalId != null) clearInterval(this.waitingRoomPollIntervalId);
		});
	}

	// `@for (...; track event.id)` en events.component.ts reusa esta MISMA instancia cuando la lista
	// se recarga (ej. tras crear/editar otro evento) — `event` como @Input cambia de referencia en
	// cada recarga, pero `ngOnInit` no vuelve a correr. Sin `ngOnChanges`, si un manager prende la sala
	// de espera de este evento con la página de Events Manager ya abierta, el polling nunca arrancaba
	// hasta recargar la página entera (bug real reportado en la revisión).
	ngOnChanges(changes: SimpleChanges): void {
		if (changes['event']) this.syncWaitingRoomPolling();
	}

	// Pollea solo si esta tarjeta corresponde a un evento con sala de espera prendida — para el resto
	// (la gran mayoría) esto no dispara ningún request, mismo espíritu que joinWaitingRoom en el
	// picker público (cero costo para quien no usa la feature). 5s de intervalo: es una vista de
	// manager mirando la fila en vivo, no hace falta la latencia más ajustada del lado del comprador.
	// Idempotente: no crea un segundo interval si ya está pollenado, y lo apaga si la sala de espera
	// se desactiva (ej. el manager edita el evento y la destildó).
	private syncWaitingRoomPolling(): void {
		if (this.event.waitingRoomEnabled) {
			if (this.waitingRoomPollIntervalId != null) return;
			const poll = () => {
				this.eventsService.getLiveStats(this.event.id).subscribe({
					next: (stats) => this.liveStats.set(stats),
					// Un poll fallido no debe hacer parpadear los badges a "sin datos" — se reintenta solo.
					error: () => {},
				});
			};
			poll();
			this.waitingRoomPollIntervalId = setInterval(poll, 5000);
		} else if (this.waitingRoomPollIntervalId != null) {
			clearInterval(this.waitingRoomPollIntervalId);
			this.waitingRoomPollIntervalId = null;
			this.liveStats.set(null);
		}
	}

	isScheduled(): boolean {
		return !!this.event.publishAt && new Date(this.event.publishAt) > new Date();
	}

	ticketBadgeLabel(ticket: Ticket): string {
		if (this.isClubTenant()) {
			if (ticket.attendeeType === 'SOCIO') return 'Socio';
			if (ticket.attendeeType === 'INVITADO') return 'Invitado';
		}
		return ticket.type;
	}

	eventDateRelative(date?: string | Date): string {
		if (!date) return 'Date unknown';
		const eventDate = new Date(date);
		const now = new Date();
		const diff = Math.floor((+now - +eventDate) / (1000 * 60 * 60 * 24));
		return diff === 0 ? 'Today' : diff === 1 ? 'Yesterday' : `${diff} days ago`;
	}
}
