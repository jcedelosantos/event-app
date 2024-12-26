import { ChangeDetectionStrategy, Component, OnInit, ElementRef, ViewChild, AfterViewInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { maps } from '../../../../data/map';
import { Map } from "../../../../models/maps/map";
import { Area } from '../../../../models/maps/area';
import { NavBarMapComponent } from "../components/nav-bar-map/nav-bar-map.component";
import { AccordionSeatsComponent } from "../components/accordion-seats/accordion-seats.component";
import { AccordionTablesComponent } from "../components/accordion-tables/accordion-tables.component";
import { CreateAreaComponent } from "../components/create-area/create-area.component";
import { ReactiveFormsModule } from '@angular/forms';

declare var bootstrap: any;

@Component({
  selector: 'app-map',
  imports: [NavBarMapComponent, AccordionSeatsComponent, AccordionTablesComponent, CreateAreaComponent, ReactiveFormsModule],
  template: `
      <nav-bar-map [maps]="maps"/>
      <div class="">
        <div class="row ">
          <!-- <div class="col col-lg-2">
            1 of 3
          </div>
          <div class="col-md-auto">
            Variable width content
          </div>
          <div class="col col-lg-2">
            3 of 3
          </div>
        </div>
        <div class="row">
          <div class="col">
            1 of 3
          </div>
          <div class="col-md-auto">
            Variable width content
          </div>
          <div class="col col-lg-2">
            3 of 3
          </div>
        </div> -->
        <div class="col-xxl-8 col-md-12 ">
          <h2> {{map?.name}}</h2>
          <p>{{map?.description}}</p>
          <div class="scrollmenu">
          @if(map?.img){
              <div class="image-container" #imageContainer (mousemove)="moveButton($event)">
                <img #image [src]="map?.img" class="background-image"  (dblclick)="openCreateAreaForm($event)" >
               
                @for(area of areas; track area.id;  let idx = $index){
                  <button class="draggable-btn"
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
        <div class="col-xxl-4 col-md-12">
          <ol class="list-group-drak row list">
            @for(area of areas; track area.id;  let idx = $index){
              <li class="list-group-item d-flex  align-items-start col-xxl-12 col-xl-6 col-lg-6 col-md-6">
                <div class="">
                  <div class="fw-bold">
                    @if(area.icon){
                      <i class="bi {{area.icon}}"></i>
                    }
                    {{area.name}}
                  </div>
                  @if(area.tables.length && area.seats.length){
                    <div class="row">
                      @if(area.tables.length){
                        <accordion-tables [tables]="area.tables" [id]="idx"/>
                      }
                      @if(area.seats.length){
                        <accordion-seats [seats]="area.seats" [id]="idx" />
                      }
                    </div>
                  }
                  </div>
                  <div class="row">
                    <div class="col-4">
                      <i class="bi bi-pen-fill"></i>
                    </div>
                    <div class="col-4">
                      <span class="badge bg-primary rounded-pill">{{area.totalcount}}</span>
                    </div>
                    <div class="col-4">
                      <i class="bi bi-file-x-fill"></i>
                    </div>
                </div>
              </li>
            }
          </ol>
         
            <!-- <div class="col-xxl-12 col-xl-6" style="background-color: blue;">
              ll
              </div>
              <div class="col-xxl-12 col-xl-6" style="background-color: red;">
              ll
              </div>
            </div> -->
          
        </div>
        
      </div>
      
      
      <create-area 
        [modal]="modal"
        [coordinates]="coordinates"
        (createAreaEvent)="addArea($event.createArea)"
      />
  `,
  styleUrl: './map.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MapComponent implements OnInit, AfterViewInit {
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


  modal: any;
  coordinates = { x: 0.0, y: 0.0 }
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
    const modalElement = document.getElementById('createAreaModal');
    if (modalElement) {
      this.modal = new bootstrap.Modal(modalElement);
    }
  }
  moveButton(event: MouseEvent) {
    if (this.isDragging && this.activeButtonIndex !== null) {
      const rect = this.imageContainer.nativeElement.getBoundingClientRect();
      const btnWidth = 80;  // Ancho aproximado del botón
      const btnHeight = 40; // Alto aproximado del botón

      let newX = event.clientX - rect.left - this.offsetX;
      let newY = event.clientY - rect.top - this.offsetY;

      // Limitar dentro de los bordes de la imagen
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

    // Calcular offset para mantener el punto de clic dentro del botón
    const rect = (event.target as HTMLElement).getBoundingClientRect();
    this.offsetX = event.clientX - rect.left;
    this.offsetY = event.clientY - rect.top;
  }

  stopDragging() {
    this.isDragging = false;
    this.activeButtonIndex = null;
  }
  openCreateAreaModal() {
    this.modal.show();
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
    if(area && this.areas && this.map){
      this.areas.push(area);
      this.map.areas = this.areas;
    }
  }

}
