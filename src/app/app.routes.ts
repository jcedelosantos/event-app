import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
	{
		path: 'site-web',
		loadComponent: () => import('./modules/site-web/site-web.component').then((m) => m.SiteWebComponent),
	},
	{
		path: 'login',
		loadChildren: () => import('./modules/login/login.module').then((m) => m.LoginModule),
	},
	{
		path: 'manager',
		canActivate: [authGuard],
		loadChildren: () => import('./modules/manager/manager.module').then((m) => m.ManagerModule),
	},
	{
		path: 'e/:code',
		loadComponent: () => import('./modules/public-event/public-event.component').then((m) => m.PublicEventComponent),
	},
	{
		path: '',
		redirectTo: 'site-web',
		pathMatch: 'full',
	},
	{
		path: '**',
		loadComponent: () => import('./modules/page-not-found/page-not-found.component').then((m) => m.PageNotFoundComponent),
	},
];
