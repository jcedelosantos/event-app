import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

export const routes: Routes = [
    {
        path: 'site-web',
        loadComponent: () => import('./modules/site-web/site-web.component').then((m) => m.SiteWebComponent)
    },
    {
        path: 'login',
        loadChildren: () => import('./modules/login/login.module').then((m) => m.LoginModule)
    },
    {
        path: 'manager',
        loadChildren: () => import('./modules/manager/manager.module').then((m) => m.LoginModule)
    },
    {
        path: '',
        redirectTo: 'site-web',
        pathMatch: 'full'
    },
    {
        path: '**',
        loadComponent: () => import('./modules/page-not-found/page-not-found.component').then((m) => m.PageNotFoundComponent)
    },
];

@NgModule({
    imports: [RouterModule.forRoot(routes)],
    exports: [RouterModule]
})

export class AppRoutingModule { }