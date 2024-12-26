import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-nav-bar-init',
  imports: [RouterLink],
  template: `
    <nav class="navbar navbar-light bg-light" >
      <div class="container-fluid">
        <a class="navbar-brand">{{title}}</a>
        <div class="d-flex">
          @for(item of menuList; track item.title){
            <a class="p-1 nav-link" routerLink="{{item.url}}">{{item.title}}</a>
          }
        </div>
      </div>
    </nav>
  `,
  styleUrl: './nav-bar-init.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NavBarInitComponent {

  title: string = "Sale App"
  menuList: Array<{ title: string; icon: string; url: string; }> = [
    { title: "Sign In", icon: "", url: "/login/sign-in" },
  ];

}
