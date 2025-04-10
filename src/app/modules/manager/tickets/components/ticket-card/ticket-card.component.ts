import { ChangeDetectionStrategy, Component, Input, AfterViewInit } from '@angular/core';

import { QRCodeComponent } from 'angularx-qrcode';
import JsBarcode /* , { Options as jsBarcodeOptions } */ from 'jsbarcode';

import { UpdateTicketModalComponent } from '../update-ticket-modal/update-ticket-modal.component';
import { DeletTicketModalComponent } from '../delet-ticket-modal/delet-ticket-modal.component';

import { Ticket } from '../../../../../models/tickets/ticket';

@Component({
	selector: 'ticket-card',
	imports: [QRCodeComponent, UpdateTicketModalComponent, DeletTicketModalComponent],
	template: `
		@if (ticket) {
			{{ ticket.name }}
			<div class="card text-white bg-dark mb-3  " style="max-width: 35rem; ">
				<div class="card-header">
					<div class="row">
						<div class="col-9">
							@if (ticket.active) {
								<span class="badge text-bg-danger">Active</span>
							} @else {
								<span class="badge text-bg-secondary">Inactive</span>
							}
							<span class="badge text-bg-warning m-1">{{ ticket.type }}</span>
						</div>
						<div class="col-3">
							<div class="d-flex flex-row-reverse">
								<button type="button" class="btn btn-dark btn-sm rounded-circle" data-bs-toggle="modal" data-bs-target="#deletTicketModal"><i class="bi bi-x-lg"></i></button>
								<button type="button" class="btn btn-dark btn-sm rounded-circle me-2" data-bs-toggle="modal" data-bs-target="#updateTicketModal"><i class="bi bi-pencil"></i></button>
							</div>
						</div>
					</div>
				</div>
				<div class="card-body">
					<h5 class="card-title">{{ ticket.name }}</h5>
					<p class="card-text ps-3">{{ ticket.description }}</p>
					<hr />
					<div class="d-flex justify-content-around">
						<h5 class="text-body-secondary"><i class="bi bi-ticket"></i> {{ ticket.count }}</h5>
						<h5 class="text-body-secondary"><i class="bi bi-currency-dollar"></i>{{ ticket.price }}</h5>
					</div>
					<hr />
					<div class="barcode">
						<svg id="barcode_{{ ticket.id }}"></svg>
					</div>
				</div>
			</div>
		}
		<app-update-ticket-modal />
		<app-delet-ticket-modal />
	`,
	styleUrl: './ticket-card.component.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TicketCardComponent implements AfterViewInit {
	@Input()
	ticket: Ticket | undefined;

	px2mmFactor: number | undefined;
	data: string = '';
	constructor() {}
	ngAfterViewInit(): void {
		if (this.ticket) {
			this.data = this.ticket.code;
			this.px2mmFactor = this.calcPx2MmFactor();

			JsBarcode('#barcode_' + this.ticket.id, this.data, {
				format: 'code128', // default
				height: 10 * this.px2mmFactor, // 10mm
				width: 2,
				// displayValue: false,
				text: '-' + this.data + '-',
				background: 'rgba(0, 0, 0, 0)',
				font: 'monospace',
				fontOptions: 'bold',
				fontSize: 18,
				lineColor: 'rgb(107, 107, 107)',
				// margin: 1 * this.px2mmFactor, // 5mm
				textMargin: 2 * this.px2mmFactor, // 2mm
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
