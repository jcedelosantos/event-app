import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'shared-foot',
  imports: [],
  template: `<p>foot works!</p>`,
  styleUrl: './foot.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FootComponent { }
