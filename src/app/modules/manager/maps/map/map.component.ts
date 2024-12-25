import { ChangeDetectionStrategy, Component, OnInit, ElementRef, ViewChild, AfterViewInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { maps } from '../../../../data/map';
import { Map } from "../../../../models/maps/map";
import { Area } from '../../../../models/maps/area';
import { NavBarMapComponent } from "../components/nav-bar-map/nav-bar-map.component";
import { AccordionSeatsComponent } from "../components/accordion-seats/accordion-seats.component";
import { AccordionTablesComponent } from "../components/accordion-tables/accordion-tables.component";

@Component({
  selector: 'app-map',
  imports: [NavBarMapComponent, AccordionSeatsComponent, AccordionTablesComponent],
  template: `
      <app-nav-bar-map />
      <h2> {{map?.name}}</h2>
      <p>{{map?.description}}</p>
      <div class="row" >
        <div class="col-9">
          @if(map?.img){
              <div class="image-container" #imageContainer (mousemove)="moveButton($event)">
                <img #image [src]="map?.img" class="background-image" >
               
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
                    <i class="bi bi-input-cursor"></i>
                   {{ area.name }}
                </button>
                }
              </div>
          }
        </div>
        <div class="col-3">
         <div class=col-12>
          <ol class="list-group-drak list-group-numbered">
            @for(area of areas; track area.id;  let idx = $index){
              <li class="list-group-item d-flex justify-content-between align-items-start">
                <div class="ms-2 me-auto">
                <div class="fw-bold">{{area.name}}</div>
                <div class="row ">
                  <accordion-tables [tables]="area.tables" [id]="idx"/>
                  <accordion-seats [seats]="area.seats" [id]="idx" />
                </div>
                </div>
                <span class="badge bg-primary rounded-pill">{{area.totalcount}}</span>
              </li>
            }
          </ol>
         </div>
        </div>
        <div class=col-12>

        </div>
        
      </div>
      
  `,
  styleUrl: './map.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MapComponent implements OnInit, AfterViewInit {
  id: string | null = '';
  maps: Array<Map> | undefined;
  map: Map | undefined;
  areas: Array<Area> | undefined;

  buttonPosition = { x: 100, y: 100 };  // Posición inicial del botón
  isDragging = false;
  activeButtonIndex: number | null = null;
  offsetX = 0;
  offsetY = 0;
  imgWidth = 0;
  imgHeight = 0;

  @ViewChild('imageContainer') imageContainer!: ElementRef;
  @ViewChild('image') image!: ElementRef;

  constructor(private route: ActivatedRoute, private router: Router) { }

  ngOnInit(): void {
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
  ngAfterViewInit() {
    if (this.image && this.imageContainer) {
      this.imgWidth = this.image.nativeElement.naturalWidth;
      this.imgHeight = this.image.nativeElement.naturalHeight;

    } else {
      console.warn('No se pudo obtener el tamaño de la imagen.');
    }
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


}
