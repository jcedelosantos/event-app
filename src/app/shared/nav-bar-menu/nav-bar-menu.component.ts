import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
@Component({
  selector: 'shared-nav-bar-menu',
  imports: [RouterLink],
  template: `
  
    <a class="nav-bar-h btn btn-dark" data-bs-toggle="offcanvas" href="#offcanvasExample" role="button" aria-controls="offcanvasExample">
    
    </a>
    <div class="offcanvas offcanvas-start menu" tabindex="-1" id="offcanvasExample" aria-labelledby="offcanvasExampleLabel">
      <div class="offcanvas-header">
        <h5 class="offcanvas-title" id="offcanvasExampleLabel">Menu</h5>
        <button type="button" class="btn-close text-reset" data-bs-dismiss="offcanvas" aria-label="Close"></button>
      </div>
      <div class="offcanvas-body">
        <div class="img-menu">
        <!-- <img src="assets/images/Screenshot.png" alt="Logo"> -->

        </div>
        <br/>
        <ul class="menu-list">
          @for(item of menuList; track item.title){
            <div class="p-1">
              <button class="btn btn-dark" routerLink="{{item.url}}">
                @if(item.icon){
                  <i class={{item.icon}}></i>
                }
                {{item.title}}
              </button>
            </div>
          }
        </ul>
        <ul class="menu-exit">
          @for(item of menuExit; track item.title){
            <div class="p-1">
              <button class="btn btn-dark" routerLink="{{item.url}}">
                @if(item.icon){
                  <i class={{item.icon}}></i>
                }
                {{item.title}}
              </button>
            </div>
          }
        </ul>
      </div>
    </div>
  `,
  styleUrl: './nav-bar-menu.component.css'
})
export class NavBarMenuComponent {

  menuList: Array<{ title: string; icon: string; url: string; }> = [
    { title: "Dash Board", icon: "bi bi-speedometer", url: "/manager/dash-board" },
    { title: "Maps", icon: "bi bi-map", url: "/manager/maps" },

  ];

  menuExit: Array<{ title: string; icon: string; url: string; }> = [
    { title: "Exit", icon: "bi bi-box-arrow-left", url: "/site-web" }
  ];

}
