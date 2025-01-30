import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-history',
  imports: [],
  template: `<p>history works!</p>`,
  styleUrl: './history.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HistoryComponent { }
