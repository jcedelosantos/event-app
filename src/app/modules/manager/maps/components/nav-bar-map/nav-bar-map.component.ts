import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-nav-bar-map',
  imports: [],
  template: `
    <div class="row nav-bar">
    <div class="col">
    
    <button type="button" class="btn btn-dark m-1"> <i class="bi bi-skip-backward-fill" ></i> Back</button>
    <button type="button" class="btn btn-dark m-1">Map</button>
          
       
     
     
    </div>
    <div class="col-md-auto">
      Variable width content
    </div>
    <div class="col col-lg-2">
      3 of 3
    </div>
  </div>
  `,
  styleUrl: './nav-bar-map.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NavBarMapComponent { 


}
