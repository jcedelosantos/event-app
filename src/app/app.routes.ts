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
		path: 'evento-unico',
		loadComponent: () => import('./modules/signup-event/signup-event.component').then((m) => m.SignupEventComponent),
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
		path: 'encuesta/:code',
		loadComponent: () => import('./modules/survey/survey-redirect.component').then((m) => m.SurveyRedirectComponent),
	},
	// Dominio propio de un tenant Enterprise (ver Tenant.customDomain, api/src/app.ts) — el backend
	// ya inyectó window.__CUSTOM_DOMAIN_TENANT_SLUG__ en index.html antes de que este archivo se
	// evalúe (el script queda en <head>, antes del bundle de Angular), así que leerlo acá alcanza:
	// la raíz del dominio del cliente renderiza directo su portal público (OrgLandingComponent),
	// SIN redirigir a /o/:slug — la URL en la barra del navegador nunca cambia. Cualquier otro
	// dominio (integ.cedanet.net, localhost) no tiene esta variable seteada y cae al comportamiento
	// de siempre.
	...(typeof window !== 'undefined' && (window as unknown as { __CUSTOM_DOMAIN_TENANT_SLUG__?: string }).__CUSTOM_DOMAIN_TENANT_SLUG__
		? [
				{
					path: '',
					pathMatch: 'full' as const,
					loadComponent: () => import('./modules/org-landing/org-landing.component').then((m) => m.OrgLandingComponent),
					data: { customDomainSlug: (window as unknown as { __CUSTOM_DOMAIN_TENANT_SLUG__?: string }).__CUSTOM_DOMAIN_TENANT_SLUG__ },
				},
			]
		: [
				{
					path: '',
					redirectTo: 'site-web',
					pathMatch: 'full' as const,
				},
			]),
	{
		path: '**',
		loadComponent: () => import('./modules/page-not-found/page-not-found.component').then((m) => m.PageNotFoundComponent),
	},
];
