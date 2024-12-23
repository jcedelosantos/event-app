import { ChangeDetectionStrategy, Component, Input, OnInit } from '@angular/core';

import { Map } from "../../../../../models/maps/map";
import { RouterLink } from '@angular/router';
// import { Area } from "../../../../models/maps/area";
// import { Seat } from "../../../../models/maps/seat";
// import { Table } from "../../../../models/maps/table";

@Component({
  selector: 'card-map',
  imports: [RouterLink],
  template: `
  @if(map){
    <div class="card mb-3" style="max-width: 540px; background-color:{{map.backGround}}; color:{{map.color}};">
      <div class="row g-0">
        <div class="col-md-6">
          <img [src]="map.img" class="img-fluid rounded-start" >
        </div>
        <div class="col-md-6">
          <div class="card-body">
            <h5 class="card-title">{{map.name}}</h5>
            <p class="card-text">{{map.description}}</p>
            <p class="card-text"><small class="text-body-secondary">Areas : {{countAreas}}</small></p>
            <p class="card-text"><small class="text-body-secondary">Table :  {{countTables}}  Seat : {{countTablesSeat}}</small></p>
            <p class="card-text"><small class="text-body-secondary">Seat :  {{countSeats}}</small></p>
            <p class="card-text"><small class="text-body-secondary"><button type="button" class="btn btn-link" routerLink="/manager/map/{{map.id}}">Sign Up</button></small></p>
          </div>
        </div>
      </div>
    </div>
  }
    
  `,
  styleUrl: './card-map.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CardMapComponent implements OnInit {
  @Input()
  map: Map | undefined;

  countAreas: number  = 0;
  countTables: number  = 0;
  countTablesSeat: number  = 0;
  countSeats: number  = 0;

  constructor() { }

  ngOnInit(): void {
    this.setAreasCount();
    this.setTablesCount();
    this.setSeatsCount();
  }

  setAreasCount(){
    if(this.map?.areas){
      this.countAreas = this.map?.areas.length;
    }
  }
  setTablesCount(){
    var tables = 0;
    var seats = 0;
    if(this.map?.areas.length){
      for(var i = 0; i < this.map?.areas.length; i++){
        var area = this.map.areas[i];
        if(area?.tables.length){
          for(var j = 0; j < area?.tables.length; j++){
            tables += 1;
            var table = area?.tables[j];
            if(table.seats.length){
              seats += table.seats.length
            }
          }
        }
      }
    }
    this.countTablesSeat = seats;
    this.countTables = tables;
  }
  setSeatsCount(){
    var count = 0;
    if(this.map?.areas.length){
      for(var i = 0; i < this.map?.areas.length; i++){
        var area = this.map.areas[i];
        if(area?.seats.length){
          for(var j = 0; j < area?.seats.length; j++){
            count += 1;
          }
        }
      }
    }
    this.countSeats = count;
  }
}
