import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';

import { maps } from '../../../data/map';
import { Map } from "../../../models/maps/map";
import { CardMapComponent } from "./components/card-map/card-map.component";

@Component({
  selector: 'app-maps',
  imports: [CardMapComponent],
  template: `
  <div class='row'>
    <div class="col-12"> find option</div>

    <div class="col-12">
      <div class="row">
        @for(map of maps; track map.id){
          <div class="col-4"> 
            <card-map [map]="map" />
          </div>
          }
      </div>
    </div>
    <div class="col-12">
      footer
    </div>
  </div>
  
  `,
  styleUrl: './maps.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MapsComponent implements OnInit{ 

  maps: Array<Map> | undefined;

  constructor(){

  }
  ngOnInit(): void {
    this.maps = maps;
  }
}
