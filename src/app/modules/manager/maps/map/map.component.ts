import { ChangeDetectionStrategy, Component, OnInit, ElementRef, ViewChild, AfterViewInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ReactiveFormsModule } from '@angular/forms';
import { GoogleMapsModule } from '@angular/google-maps';
declare var bootstrap: any;

import { maps } from '../../../../data/map';
import { Map } from "../../../../models/maps/map";
import { Area } from '../../../../models/maps/area';
import { NavBarMapComponent } from "../components/nav-bar-map/nav-bar-map.component";
import {  CollapseSeatsComponent } from "../components/collapse-seats/collapse-seats.component";
import { CollapseTablesComponent } from "../components/accordion-tables/collapse-tables.component";
import { CreateAreaComponent } from "../components/create-area/create-area.component";
import { UpdateAreaComponent } from "../components/update-area/update-area.component";

@Component({
  selector: 'app-map',
  imports: [GoogleMapsModule, NavBarMapComponent, CollapseTablesComponent, CreateAreaComponent, ReactiveFormsModule, UpdateAreaComponent, CollapseSeatsComponent],
  template: `
      <nav-bar-map [maps]="maps"/>
      <div class="scrollmap">
        <div class="row">
        <div class="col-xxl-9 col-md-12 ">
          <div class="card" >
            <div class="card-header">
              <h4>{{map?.name}}</h4>
            </div>
            <ul class="list-group list-group-flush">
              <google-map  height="280px" width="100%" [center]="center" [zoom]="zoom">
                <map-marker [position]="center" [label]="'Ubicación X'"></map-marker>
              </google-map>
              <li class="list-group-item">
                <div class="row">
                  <div class="col-5">
                    <h5 class="card-title">{{map?.description}}</h5>
                  </div>
                  <div class="col-7">
                  <div class="d-flex justify-content-end">
                    <div class="bd-highlight me-4">  Areas : <span class="badge text-bg-danger">{{map?.areas?.length}}</span></div>
                    <div class="bd-highlight me-4">Tables : <span class="badge text-bg-danger"> {{map?.totalTables}}</span> /  <span class="badge text-bg-danger">{{map?.totalTablesSeat}}</span></div>
                    <div class="bd-highlight me-"> Seat : <span class="badge text-bg-danger">{{map?.totalSeats}}</span></div>
                  </div>
                  </div>
                </div>
              </li>
            </ul>
          </div>
          <br/>
          <div class="scrollimg">
            <div class="container">
              @if(map?.img){
                  <div class="image-container " #imageContainer (mousemove)="moveButton($event)">
                    <img #image [src]="map?.img" class="background-image"  (dblclick)="openCreateAreaForm($event)" >
                    @for(area of areas; track area.id;  let idx = $index){
                      <button class="draggable-btn "
                        (dblclick)="openUpdateAreaForm(area)"
                        (mousedown)="startDragging(idx, $event)"
                        (mouseup)="stopDragging()"
                        (mouseleave)="stopDragging()"
                        [style.color]="area.color"
                        [style.background]="area.backGround"
                        [style.font-size.px]="area.size"
                        [style.top.px]="area.y"
                        [style.left.px]="area.x">
                        @if(area.icon){
                          <i class="bi {{area.icon}}"></i>
                        }
                       {{ area.name }}
                    </button>
                    }
                  </div>
              }
            </div>
          </div>
        </div>
        @if(areas){
          <div class="col-xxl-3 col-md-12">
            <div class="scroll-list">
              @for(area of areas; track area.id;  let idx = $index){
                <div class="card" >
                  <div class="card-header">
                  @if(area.icon){
                      <i class="bi {{area.icon}}"></i>
                    }
                    {{area.name}}
                  </div>
                  <ul class="list-group list-group-flush">
                    <collapse-seats [seats]="area.seats" [id]="idx" />
                    <collapse-tables [tables]="area.tables" [id]="idx"/>
                    <li class="list-group-item">
                    
                    </li>
                  </ul>
                </div>
                <br/>
              }
            </div>
          </div>
        } 
        </div>
      </div>
     
      <create-area 
        [modal]="modalCreateArea"
        [coordinates]="coordinates"
        (createAreaEvent)="addArea($event.createArea)"
      />
      <update-area 
        [modal]="modalUpdateArea"
        [area]="areaUpdate"
        (updateAreaEvent)="updateArea($event.updateArea)"
      />
  `,
  styleUrl: './map.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MapComponent implements OnInit, AfterViewInit {
  center: google.maps.LatLngLiteral = { lat: 18.4628068, lng: -70.0412847 };
  zoom = 20;

  id: string | null = '';
  maps: Array<Map> | undefined;
  map: Map | undefined;
  areas: Array<Area> | undefined;

  isDragging = false;
  activeButtonIndex: number | null = null;
  offsetX = 0;
  offsetY = 0;
  imgWidth = 0;
  imgHeight = 0;

  @ViewChild('imageContainer') imageContainer!: ElementRef;
  @ViewChild('image') image!: ElementRef;


  modalCreateArea: any;
  coordinates = { x: 0.0, y: 0.0 }

  modalUpdateArea: any;
  areaUpdate: Area | undefined;
  

  constructor(private route: ActivatedRoute, private router: Router) { }

  ngOnInit(): void {
    this.initMapInfo();
  }

  ngAfterViewInit() {
    this.getSizeImg();
    this.getInitModal();
  }
  initMapInfo() {
    this.maps = maps;
    this.route.paramMap.subscribe(params => {
      this.id = params.get('id');
      if (this.id) {
        this.getMap(parseInt(this.id));
        if (this.map?.areas) {
          this.areas = this.map?.areas;
        }
      }
      else {
        this['router'].navigate(['/manager/maps']);
      }
    });
  }
  getMap(id: number) {
    if (this.maps) {
      for (var i = 0; i < this.maps?.length; i++) {
        if (this.maps[i].id === id) {
          this.map = this.maps[i];
          this.center = { lat: this.map.x, lng: this.map.y };
          break;
        }
      }
    }
  }
  getSizeImg() {
    if (this.image && this.imageContainer) {
      this.imgWidth = this.image.nativeElement.naturalWidth;
      this.imgHeight = this.image.nativeElement.naturalHeight;

    } else {
      console.warn('No se pudo obtener el tamaño de la imagen.');
    }
  }
  getInitModal() {
    var modalElement = document.getElementById('createAreaModal');
    if (modalElement) {
      this.modalCreateArea = new bootstrap.Modal(modalElement);
    }
    modalElement = document.getElementById('updateAreaModal');
    if (modalElement) {
      this.modalUpdateArea = new bootstrap.Modal(modalElement);
    }
  }
  moveButton(event: MouseEvent) {
    if (this.isDragging && this.activeButtonIndex !== null) {
      const rect = this.imageContainer.nativeElement.getBoundingClientRect();
      const btnWidth = 80;
      const btnHeight = 40;

      let newX = event.clientX - rect.left - this.offsetX;
      let newY = event.clientY - rect.top - this.offsetY;

      newX = Math.max(0, Math.min(rect.width - btnWidth, newX));
      newY = Math.max(0, Math.min(rect.height - btnHeight, newY));
      if (this.areas) {
        this.areas[this.activeButtonIndex].x = newX;
        this.areas[this.activeButtonIndex].y = newY;

      }
    }
  }
  startDragging(index: number, event: MouseEvent) {
    this.isDragging = true;
    this.activeButtonIndex = index;

    const rect = (event.target as HTMLElement).getBoundingClientRect();
    this.offsetX = event.clientX - rect.left;
    this.offsetY = event.clientY - rect.top;
  }

  stopDragging() {
    this.isDragging = false;
    this.activeButtonIndex = null;
  }
  openCreateAreaModal() {
    this.modalCreateArea.show();
  }
  openUpdateAreaModal() {
    this.modalUpdateArea.show();
  }

  getMouseCoordinates(event: MouseEvent): { y: number; x: number; } {
    const rect = this.imageContainer.nativeElement.getBoundingClientRect();
    let newX = event.clientX - rect.left - this.offsetX;
    let newY = event.clientY - rect.top - this.offsetY;

    newX = Math.max(0, Math.min(rect.width, newX));
    newY = Math.max(0, Math.min(rect.height, newY));

    this.offsetX = event.clientX - rect.left;
    this.offsetY = event.clientY - rect.top;

    return { y: this.offsetY, x: this.offsetX }
  }
  openCreateAreaForm(event: MouseEvent) {
    this.coordinates = this.getMouseCoordinates(event);
    this.openCreateAreaModal();
  }

  addArea(area: Area) {
    console.log(area);
    if (area && this.areas && this.map) {
      this.areas.push(area);
      this.map.areas = this.areas;
    }
  }

  openUpdateAreaForm(area: Area) {
    this.areaUpdate = area;
    this.openUpdateAreaModal();
  }

  updateArea(updateArea: Area) {
    console.log(updateArea);
    if (this.areas) {
      for (let i = 0; i < this.areas.length; i++) {
        const element = this.areas[i];
        if (element.id === updateArea.id) {
          this.areas[i] = updateArea;
          break;
        }
      }
    }
  }

}
