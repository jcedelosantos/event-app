import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-tickets',
  imports: [],
  template: `<p>tickets works!</p>`,
  styleUrl: './tickets.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TicketsComponent { }
