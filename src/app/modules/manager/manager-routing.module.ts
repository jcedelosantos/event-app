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
import { LocationsComponent } from './locations/locations.component';
import { ReportsComponent } from './reports/reports.component';
import { HistoryComponent } from './history/history.component';
import { QrsComponent } from './qrs/qrs.component';
import { ProductsComponent } from './products/products.component';
import { InvoicesComponent } from './invoices/invoices.component';
import { EventDetailsComponent } from './events/event-details/event-details.component';
import { QrScannerComponent } from './events/components/qr-scanner/qr-scanner.component';
import { SettingsComponent } from './settings/settings.component';
import { SubscriptionComponent } from './subscription/subscription.component';
import { ServiceRequestsComponent } from './service-requests/service-requests.component';
import { EventWizardComponent } from './events/components/event-wizard/event-wizard.component';
import { HelpComponent } from './help/help.component';
import { activeSubscriptionGuard } from '../../core/guards/active-subscription.guard';
import { scannerRoleGuard } from '../../core/guards/scanner-role.guard';

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
				canActivate: [activeSubscriptionGuard, scannerRoleGuard],
			},
			{
				path: 'maps',
				component: MapsComponent,
				canActivate: [activeSubscriptionGuard, scannerRoleGuard],
			},
			{
				path: 'maps/:id/areas',
				component: AreasComponent,
				canActivate: [activeSubscriptionGuard, scannerRoleGuard],
			},
			{
				path: 'maps/:id_map/areas/:id_area',
				component: SeatsComponent,
				canActivate: [activeSubscriptionGuard, scannerRoleGuard],
			},
			{
				path: 'events',
				canActivate: [activeSubscriptionGuard],
				children: [
					// scannerRoleGuard va por-hijo acá, no en el padre 'events': qr-scanner es la ÚNICA
					// pantalla que un usuario SCANNER puede usar (ver core/guards/scanner-role.guard.ts),
					// el resto de este subárbol (lista de eventos, wizard) queda vedado igual que todo lo
					// demás del manager.
					{ path: '', component: EventsComponent, canActivate: [scannerRoleGuard] },
					{ path: 'wizard', component: EventWizardComponent, canActivate: [scannerRoleGuard] },
					{ path: 'qr-scanner', component: QrScannerComponent },
				]
			},
			{
				path: 'events/:id_event',
				component: EventDetailsComponent,
				canActivate: [activeSubscriptionGuard, scannerRoleGuard],
			},
			{
				path: 'tickets',
				component: TicketsComponent,
				canActivate: [activeSubscriptionGuard, scannerRoleGuard],
			},
			{
				path: 'users',
				component: UsersComponent,
				canActivate: [activeSubscriptionGuard, scannerRoleGuard],
			},
			{
				path: 'locations',
				component: LocationsComponent,
				canActivate: [activeSubscriptionGuard, scannerRoleGuard],
			},
			{
				path: 'reports',
				component: ReportsComponent,
				canActivate: [activeSubscriptionGuard, scannerRoleGuard],
			},
			{
				path: 'history',
				component: HistoryComponent,
				canActivate: [activeSubscriptionGuard, scannerRoleGuard],
			},
			{
				path: 'settings',
				component: SettingsComponent,
				canActivate: [activeSubscriptionGuard, scannerRoleGuard],
			},
			{
				path: 'qrs',
				component: QrsComponent,
				canActivate: [activeSubscriptionGuard, scannerRoleGuard],
			},
			{
				path: 'products',
				component: ProductsComponent,
				canActivate: [activeSubscriptionGuard, scannerRoleGuard],
			},
			{
				path: 'invoices',
				component: InvoicesComponent,
				canActivate: [activeSubscriptionGuard, scannerRoleGuard],
			},
			{
				path: 'solicitudes',
				component: ServiceRequestsComponent,
				canActivate: [activeSubscriptionGuard, scannerRoleGuard],
			},
			{
				path: 'ayuda',
				component: HelpComponent,
				canActivate: [activeSubscriptionGuard, scannerRoleGuard],
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
