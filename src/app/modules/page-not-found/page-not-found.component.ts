import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-page-not-found',
  imports: [],
  template: `
    <h2>Page Not Found</h2>
    <p>We couldn't find that page! Not even with x-ray vision.</p>
  `,
  styleUrl: './page-not-found.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PageNotFoundComponent { }
