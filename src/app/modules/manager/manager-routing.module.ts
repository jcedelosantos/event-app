import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Routes } from '@angular/router';
import { LayoutPageComponent } from './layout-page/layout-page.component';
import { DashBoardComponent } from './dash-board/dash-board.component';
import { MapsComponent } from './maps/maps.component';
import { AreasComponent } from './maps/areas/areas.component';
import { EventsComponent } from './events/events.component';
import { SeatsComponent } from './maps/seats/seats.component';
import { TicketsComponent } from './tickets/tickets.component';
import { UsersComponent } from './users/users.component';
import { ReportsComponent } from './reports/reports.component';
import { HistoryComponent } from './history/history.component';
import { QrsComponent } from './qrs/qrs.component';
import { ProductsComponent } from './products/products.component';
import { SalesComponent } from './sales/sales.component';
import { EventDetailsComponent } from './events/event-details/event-details.component';
import { QrScannerComponent } from './events/components/qr-scanner/qr-scanner.component';
import { SettingsComponent } from './settings/settings.component';
import { SubscriptionComponent } from './subscription/subscription.component';
import { ServiceRequestsComponent } from './service-requests/service-requests.component';
import { EventWizardComponent } from './events/components/event-wizard/event-wizard.component';
import { activeSubscriptionGuard } from '../../core/guards/active-subscription.guard';

const routes: Routes = [
	{
		path: '',
		component: LayoutPageComponent,
		children: [
			// Sin activeSubscriptionGuard a propósito: es la pantalla a la que el guard REDIRIGE cuando
			// bloquea el resto — aplicarle el mismo guard crearía un loop de redirección.
			{
				path: 'suscripcion',
				component: SubscriptionComponent,
			},
			{
				path: 'dash-board',
				component: DashBoardComponent,
				canActivate: [activeSubscriptionGuard],
			},
			{
				path: 'maps',
				component: MapsComponent,
				canActivate: [activeSubscriptionGuard],
			},
			{
				path: 'maps/:id/areas',
				component: AreasComponent,
				canActivate: [activeSubscriptionGuard],
			},
			{
				path: 'maps/:id_map/areas/:id_area',
				component: SeatsComponent,
				canActivate: [activeSubscriptionGuard],
			},
			{
				path: 'events',
				canActivate: [activeSubscriptionGuard],
				children: [
					{ path: '', component: EventsComponent },
					{ path: 'wizard', component: EventWizardComponent },
					{ path: 'qr-scanner', component: QrScannerComponent },
				]
			},
			{
				path: 'events/:id_event',
				component: EventDetailsComponent,
				canActivate: [activeSubscriptionGuard],
			},
			{
				path: 'tickets',
				component: TicketsComponent,
				canActivate: [activeSubscriptionGuard],
			},
			{
				path: 'users',
				component: UsersComponent,
				canActivate: [activeSubscriptionGuard],
			},
			{
				path: 'reports',
				component: ReportsComponent,
				canActivate: [activeSubscriptionGuard],
			},
			{
				path: 'history',
				component: HistoryComponent,
				canActivate: [activeSubscriptionGuard],
			},
			{
				path: 'settings',
				component: SettingsComponent,
				canActivate: [activeSubscriptionGuard],
			},
			{
				path: 'qrs',
				component: QrsComponent,
				canActivate: [activeSubscriptionGuard],
			},
			{
				path: 'products',
				component: ProductsComponent,
				canActivate: [activeSubscriptionGuard],
			},
			{
				path: 'sales',
				component: SalesComponent,
				canActivate: [activeSubscriptionGuard],
			},
			{
				path: 'solicitudes',
				component: ServiceRequestsComponent,
				canActivate: [activeSubscriptionGuard],
			},
			{
				path: 'sales/:id_sale',
				component: SalesComponent,
				canActivate: [activeSubscriptionGuard],
			},
			// {
			//     path: 'event/:id',
			//   component: EventsComponent
			// },
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
export class ManagerRoutingModule {}
