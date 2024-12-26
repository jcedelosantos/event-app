import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Routes } from '@angular/router';
import { LayoutPageComponent } from './layout-page/layout-page.component';
import { DashBoardComponent } from './dash-board/dash-board.component';
import { MapsComponent } from './maps/maps.component';
import { MapComponent } from './maps/map/map.component';

const routes: Routes = [
    {
        path: '',
        component: LayoutPageComponent,
        children: [
            {
                path: 'dash-board',
                component: DashBoardComponent
            },
            {
                path: 'maps',
              component: MapsComponent
            },
            {
                path: 'map/:id',
              component: MapComponent
            },
            {
                path: '**',
                redirectTo: 'sign-in'
            },
        ]
    }
];

@NgModule({
    imports: [
        CommonModule,
        RouterModule.forChild(routes)
    ],
    exports: [RouterModule, ]
})
export class ManagerRoutingModule { }