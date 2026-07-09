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

const routes: Routes = [
	{
		path: '',
		component: LayoutPageComponent,
		children: [
			{
				path: 'dash-board',
				component: DashBoardComponent,
			},
			{
				path: 'maps',
				component: MapsComponent,
			},
			{
				path: 'maps/:id/areas',
				component: AreasComponent,
			},
			{
				path: 'maps/:id_map/areas/:id_area',
				component: SeatsComponent,
			},
			{
				path: 'events',
				children: [
					{ path: '', component: EventsComponent },
					{ path: 'qr-scanner', component: QrScannerComponent },
				]
			},
			{
				path: 'events/:id_event',
				component: EventDetailsComponent,
			},
			{
				path: 'tickets',
				component: TicketsComponent,
			},
			{
				path: 'users',
				component: UsersComponent,
			},
			{
				path: 'reports',
				component: ReportsComponent,
			},
			{
				path: 'history',
				component: HistoryComponent,
			},
			{
				path: 'qrs',
				component: QrsComponent,
			},
			{
				path: 'products',
				component: ProductsComponent,
			},
			{
				path: 'sales',
				component: SalesComponent,
			},
			{
				path: 'sales/:id_sale',
				component: SalesComponent,
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
