import { Component, effect, input } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { QR } from '../../services/qr.service';

@Component({
  selector: 'app-event-detail-modal',
  imports: [ReactiveFormsModule],
  templateUrl: './event-detail-modal.component.html',
  styleUrl: './event-detail-modal.component.css'
})
export class EventDetailModalComponent {
  eventDetail = input<QR | null>(null);

  eventDetailForm = new FormGroup({
    name: new FormControl<string>(''),
    map: new FormControl<string>(''),
    area: new FormControl<string>(''),
    seat: new FormControl<string>(''),
    ticket: new FormControl<string>(''),
    type: new FormControl<string>(''),
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
    if (this.eventDetail()) {
      this.eventDetailForm.patchValue({
        name: this.eventDetail()?.events.name,
        map: this.eventDetail()?.map.name,
        area: this.eventDetail()?.area.name,
        seat: this.eventDetail()?.seats.toString(),
        ticket: this.eventDetail()?.ticket.name,
        type: this.eventDetail()?.type,
        code: this.eventDetail()?.code,
        date: this.eventDetail()?.events.dateOn.toISOString().slice(0, 10)
      });
      this.eventDetailForm.disable();
    }
  }

}
