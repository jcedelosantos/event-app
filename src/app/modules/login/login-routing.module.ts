import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Routes } from '@angular/router';
import { LayoutPageComponent } from './layout-page/layout-page.component';
import { SignInComponent } from './sign-in/sign-in.component';
import { ForgotPasswordComponent } from './forgot-password/forgot-password.component';
import { ResetPasswordComponent } from './reset-password/reset-password.component';

const routes: Routes = [
	{
		path: '',
		component: LayoutPageComponent,
		children: [
			{
				path: 'sign-in',
				component: SignInComponent,
			},
			{
				// El alta de una organización nueva no es un "sign-up" de sesión — vive en /signup,
				// un flujo público de marketing/suscripción, no bajo /login (ver app.routes.ts).
				path: 'sign-up',
				redirectTo: '/signup',
			},
			{
				path: 'forgot-password',
				component: ForgotPasswordComponent,
			},
			{
				path: 'reset-password',
				component: ResetPasswordComponent,
			},
			{
				path: '**',
				redirectTo: 'sign-in',
			},
		],
	},
];

@NgModule({
	imports: [CommonModule, RouterModule.forChild(routes)],
	exports: [RouterModule],
})
export class LoginRoutingModule {}
