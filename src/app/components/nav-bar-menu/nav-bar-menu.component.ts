import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
@Component({
  selector: 'app-nav-bar-menu',
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
            <li><a routerLink="/login/sign-in">Sign In</a></li>
            <li><a routerLink="/login/sign-up">Sign Up</a></li>
            <li><a routerLink="/site-web">Site Web</a></li>
            <li><a routerLink="/404">404 error</a></li>
          </ul>
      </div>
    </div>
  `,
  styleUrl: './nav-bar-menu.component.css'
})
export class NavBarMenuComponent { }
