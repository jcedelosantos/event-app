import { ChangeDetectionStrategy, Component, AfterViewInit, input, output } from '@angular/core';
import JsBarcode /* , { Options as jsBarcodeOptions } */ from 'jsbarcode';

import { NgClass } from '@angular/common';
import { Ticket } from '../../../../../models/tickets/ticket';

@Component({
	selector: 'ticket-card',
	imports: [NgClass],
	template: `
		@if (ticket()) {
			<div class="card text-white bg-dark mb-2 h-100 d-flex flex-column ticket-card-sm">
				<div class="card-header">
					<div class="d-flex justify-content-between align-items-start">
						<div class="d-flex flex-wrap gap-1">
							<span class="badge "
								[ngClass]="{'text-bg-success': ticket().active,
											'text-bg-danger': !ticket().active}">
								{{ticket().active ? 'Active' : 'Inactive'}}
							</span>
							<span class="badge"
							[ngClass]="{'text-bg-purple ': ticket().type === 'VIP',
										'text-bg-secondary': ticket().type !== 'VIP'}">
										{{ ticket().type }}
									</span>
						</div>
						<div class="d-flex flex-row-reverse">
							<button type="button" class="btn btn-dark btn-sm rounded-circle" (click)="deleteTicket.emit(ticket())"><i class="bi bi-x-lg"></i></button>
							<button type="button" class="btn btn-dark btn-sm rounded-circle me-1" (click)="selectedTicket.emit(ticket())" data-bs-toggle="modal" data-bs-target="#updateTicketModal"><i class="bi bi-pencil"></i></button>
						</div>
					</div>
				</div>
				<div class="card-body d-flex flex-column flex-grow-1">
					<h6 class="card-title mb-1">{{ ticket().name }}</h6>
					<p class="card-text ticket-description small text-body-secondary mb-1">{{ ticket().description }}</p>
					<p class="ticket-scope small text-body-secondary mb-1">
						<i class="bi bi-calendar-event"></i> {{ ticket().event?.name ?? '—' }}<br />
						<i class="bi bi-geo-alt"></i> {{ ticket().area?.name ?? 'Todas las áreas' }}
					</p>
					<hr class="my-1" />
					<div class="d-flex justify-content-around">
						<span class="text-body-secondary small"><i class="bi bi-ticket"></i> {{ ticket().count }}</span>
						<span class="text-body-secondary small"><i class="bi bi-currency-dollar"></i>{{ ticket().price }}</span>
					</div>
					<hr class="mt-auto my-1" />
					<div class="barcode">
						<svg id="barcode_{{ ticket().id }}"></svg>
					</div>
				</div>
			</div>
		}
	`,
	styleUrl: './ticket-card.component.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TicketCardComponent implements AfterViewInit {

	ticket = input.required<Ticket>();
	selectedTicket = output<Ticket | null>();
	deleteTicket = output<Ticket>();

	ngAfterViewInit(): void {
		
		if (this.ticket()) {
			const data = this.ticket().code;
			const px2mmFactor = this.calcPx2MmFactor();

			JsBarcode('#barcode_' + this.ticket().id, data, {
				format: 'code128', // default
				height: 6 * px2mmFactor, // 6mm — tarjeta más chica, código más bajo
				width: 1.3,
				// displayValue: false,
				text: '-' + data + '-',
				background: 'rgba(0, 0, 0, 0)',
				font: 'monospace',
				fontOptions: 'bold',
				fontSize: 12,
				lineColor: 'rgb(107, 107, 107)',
				// margin: 1 * this.px2mmFactor, // 5mm
				textMargin: 1 * px2mmFactor, // 1mm
				// textAlign: 'right',
				// textPosition: 'top',
			});
		}
	}

	private calcPx2MmFactor() {
		let e = document.createElement('div');
		e.style.position = 'absolute';
		e.style.width = '100mm';
		document.body.appendChild(e);
		let rect = e.getBoundingClientRect();
		document.body.removeChild(e);
		return rect.width / 100;
	}
}
