import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Routes } from '@angular/router';
import { LayoutPageComponent } from './layout-page/layout-page.component';
import { SignInComponent } from './sign-in/sign-in.component';
import { SignUpComponent } from './sign-up/sign-up.component';
import { ForgotPasswordComponent } from './forgot-password/forgot-password.component';

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
				path: 'sign-up',
				component: SignUpComponent,
			},
			{
				path: 'forgot-password',
				component: ForgotPasswordComponent,
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
