import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-sales',
  imports: [],
  template: `<p>sales works!</p>`,
  styleUrl: './sales.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SalesComponent { }
