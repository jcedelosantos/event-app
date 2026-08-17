import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
	selector: 'app-nav-bar-init',
	imports: [RouterLink],
	template: `
		<nav class="navbar navbar-light bg-light">
			<div class="container-fluid">
				<a class="navbar-brand d-flex align-items-center gap-2">
					<img src="assets/images/integ-icon.png" alt="" height="32" />
					{{ title }}
					<small class="d-none d-sm-inline text-body-secondary fw-normal">— Infraestructura Tecnológica de Gestión de Eventos</small>
				</a>
				<div class="d-flex">
					@for (item of menuList; track item.title) {
						<a class="p-1 nav-link" routerLink="{{ item.url }}">{{ item.title }}</a>
					}
				</div>
			</div>
		</nav>
	`,
	styleUrl: './nav-bar-init.component.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NavBarInitComponent {
	title: string = 'INTEG';
	menuList: Array<{ title: string; icon: string; url: string }> = [{ title: 'Iniciar sesión', icon: '', url: '/login/sign-in' }];
}
