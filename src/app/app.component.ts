import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NavBarMenuComponent } from "./components/nav-bar-menu/nav-bar-menu.component";
import {FootComponent} from "./components/foot/foot.component"

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, NavBarMenuComponent, FootComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {
  title = 'seat-app';
}
