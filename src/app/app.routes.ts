import { Routes } from '@angular/router';

export const routes: Routes = [
    { 
        path: 'site-web', 
        loadComponent: ()=> import('./modules/site-web/site-web.component').then((m) => m.SiteWebComponent) 
    },
    { 
        path: '**',
        loadComponent: ()=> import('./modules/page-not-found/page-not-found.component').then((m) => m.PageNotFoundComponent)
    },
];
