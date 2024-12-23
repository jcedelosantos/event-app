import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-dash-board',
  imports: [],
  template: `
   
      <p>dash-board works!</p>
  `,
  styleUrl: './dash-board.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashBoardComponent { }
