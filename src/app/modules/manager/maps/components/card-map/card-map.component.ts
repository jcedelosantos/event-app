import { ChangeDetectionStrategy, Component, Input, OnInit } from '@angular/core';


import { Map } from "../../../../../models/maps/map";
import { RouterLink } from '@angular/router';
import { GoogleMapsModule } from '@angular/google-maps';
// import { Area } from "../../../../models/maps/area";
// import { Seat } from "../../../../models/maps/seat";
// import { Table } from "../../../../models/maps/table";

@Component({
  selector: 'card-map',
  imports: [RouterLink, GoogleMapsModule],
  template: `
  @if(map){
    <div class="card">
      <h3 class="card-header">{{map.name}}</h3>
      <div class="map-container">
        <google-map  height="400px" width="100%" [center]="center" [zoom]="zoom">
            <map-marker [position]="center" [label]="'Ubicación X'"></map-marker>
          </google-map>
      </div>
      <div class="card-body">
        <h5 class="card-title">{{map.description}}</h5>
        <p class="card-text">Areas : {{countAreas}}  Table :  {{countTables}}  Seat : {{countTablesSeat}}  Seat :  {{countSeats}}</p>
        <button type="button" class="btn btn-dark" routerLink="/manager/map/{{map.id}}">View Details</button>
      </div>
    </div>
    <br/>
  }
    
  `,
  styleUrl: './card-map.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CardMapComponent implements OnInit {
  center: google.maps.LatLngLiteral = { lat: 18.4628068, lng: -70.0412847 };  
  zoom = 20;

  @Input()
  map: Map | undefined;

  countAreas: number  = 0;
  countTables: number  = 0;
  countTablesSeat: number  = 0;
  countSeats: number  = 0;

  constructor() { }

  ngOnInit(): void {
    if(this.map){
      this.center = { lat: this.map.x, lng: this.map.y };
    }
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
