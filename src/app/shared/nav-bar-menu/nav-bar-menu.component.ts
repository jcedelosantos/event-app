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
        
        </div>
        <br/>
        <ul >
          @for(item of menuList; track item.title){
            <li><a routerLink="{{item.url}}">{{item.title}}</a></li>
          }
        </ul>
      </div>
    </div>
  `,
  styleUrl: './nav-bar-menu.component.css'
})
export class NavBarMenuComponent {

  menuList: Array<{ title: string;  icon: string;  url: string;  }> = [
      { title: "Sign In", icon: "", url: "/login/sign-in" },
      { title: "Sign Up", icon: "", url: "/login/sign-up" },
      { title: "Site Web", icon: "", url: "/site-web" },
      { title: "404 error", icon: "", url: "/404" },
    ];

}
