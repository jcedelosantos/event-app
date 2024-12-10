import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-site-web',
  imports: [],
  template: `<p>site-web works!</p>`,
  styleUrl: './site-web.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SiteWebComponent { }
