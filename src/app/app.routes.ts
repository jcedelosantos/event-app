import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { superAdminGuard } from './core/guards/super-admin.guard';

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
		path: 'signup',
		loadComponent: () => import('./modules/signup/signup.component').then((m) => m.SignupComponent),
	},
	{
		path: 'signup/confirmacion',
		loadComponent: () => import('./modules/signup/signup-confirmation.component').then((m) => m.SignupConfirmationComponent),
	},
	{
		path: 'manager',
		canActivate: [authGuard],
		loadChildren: () => import('./modules/manager/manager.module').then((m) => m.ManagerModule),
	},
	{
		path: 'super-admin',
		canActivate: [superAdminGuard],
		loadComponent: () => import('./modules/super-admin/super-admin.component').then((m) => m.SuperAdminComponent),
	},
	{
		path: 'e/:code',
		loadComponent: () => import('./modules/public-event/public-event.component').then((m) => m.PublicEventComponent),
	},
	{
		path: 'o/:slug',
		loadComponent: () => import('./modules/org-landing/org-landing.component').then((m) => m.OrgLandingComponent),
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
