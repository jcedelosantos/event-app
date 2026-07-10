import { Component, effect, input } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { SaleTicket } from '../../services/qr.service';

@Component({
  selector: 'app-event-detail-modal',
  imports: [ReactiveFormsModule],
  templateUrl: './event-detail-modal.component.html',
  styleUrl: './event-detail-modal.component.css'
})
export class EventDetailModalComponent {
  eventDetail = input<SaleTicket | null>(null);

  eventDetailForm = new FormGroup({
    name: new FormControl<string>(''),
    area: new FormControl<string>(''),
    seat: new FormControl<string>(''),
    ticket: new FormControl<string>(''),
    client: new FormControl<string>(''),
    code: new FormControl<string>(''),
    date: new FormControl<string>('')
  });

  constructor() {
    effect(() => {
      if (this.eventDetail()) {
        this.fillForm();
      }
    });
  }


  fillForm() {
    const detail = this.eventDetail();
    if (detail) {
      this.eventDetailForm.patchValue({
        name: detail.event.name,
        area: detail.seat.area.name,
        seat: detail.seat.name,
        ticket: detail.ticket.name,
        client: `${detail.client.name} ${detail.client.lastname}`,
        code: detail.codeQR,
        date: new Date(detail.dateSold).toLocaleDateString()
      });
      this.eventDetailForm.disable();
    }
  }

}
