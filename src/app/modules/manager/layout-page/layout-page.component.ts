import { ChangeDetectionStrategy, Component } from '@angular/core';
import { NavBarMenuComponent } from "../../../shared/nav-bar-menu/nav-bar-menu.component";
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-layout-page',
  imports: [NavBarMenuComponent, RouterOutlet],
  template: `
  <div class="row maps" data-bs-theme="dark">
    <div class="col-auto">
      <shared-nav-bar-menu />
    </div>
    <div class="col-11 col-ms-10">
      <router-outlet />
    </div>
  </div>
  
  `,
  styleUrl: './layout-page.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LayoutPageComponent { }
