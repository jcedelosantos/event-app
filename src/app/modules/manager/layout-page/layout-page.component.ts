import { ChangeDetectionStrategy, Component } from '@angular/core';
import { NavBarMenuComponent } from '../../../shared/nav-bar-menu/nav-bar-menu.component';
import { RouterOutlet } from '@angular/router';

@Component({
	selector: 'app-layout-page',
	imports: [NavBarMenuComponent, RouterOutlet],
	template: `
		<div class="row maps" data-bs-theme="dark">
			<div class="col-lg-auto col-md-1 col-sm-1">
				<shared-nav-bar-menu />
			</div>
			<div class="col-11">
				<router-outlet />
			</div>
		</div>
	`,
	styleUrl: './layout-page.component.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LayoutPageComponent {}
