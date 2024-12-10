import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NavBarMenuComponent } from "./components/nav-bar-menu/nav-bar-menu.component";

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, NavBarMenuComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {
  title = 'seat-app';
}
