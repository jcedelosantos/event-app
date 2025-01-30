import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-qrs',
  imports: [],
  template: `<p>qrs works!</p>`,
  styleUrl: './qrs.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QrsComponent { }
