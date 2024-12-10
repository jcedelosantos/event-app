import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
@Component({
  selector: 'app-nav-bar-menu',
  imports: [ RouterLink],
  template: `
    <nav>
      <ul>
      <li><a routerLink="/">Home</a></li>
        <li><a routerLink="/site-web">Site Web</a></li>
        <li><a routerLink="/404">404 error</a></li>
      </ul>
    </nav>
  `,
  styleUrl: './nav-bar-menu.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NavBarMenuComponent { }
