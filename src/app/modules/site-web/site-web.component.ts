import { ChangeDetectionStrategy, Component } from '@angular/core';
import { NavBarInitComponent } from "../../shared/nav-bar-init/nav-bar-init.component";

@Component({
  selector: 'app-site-web',
  imports: [NavBarInitComponent],
  templateUrl: './site-web.component.html',
  styleUrl: './site-web.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SiteWebComponent { }
