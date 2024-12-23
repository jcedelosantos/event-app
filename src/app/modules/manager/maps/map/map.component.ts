import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { maps } from '../../../../data/map';
import { Map } from "../../../../models/maps/map";
import { JsonPipe } from '@angular/common';

@Component({
  selector: 'app-map',
  imports: [JsonPipe],
  template: `
    <p>map works! {{id}}</p>
    <p>map works! {{map | json}}</p>
  `,
  styleUrl: './map.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MapComponent implements OnInit {
  id: string | null = '';
  maps: Array<Map> | undefined;
  map: Map | undefined;

  constructor(private route: ActivatedRoute,  private router: Router) { 

  }
  ngOnInit(): void {
    this.maps = maps;
    this.route.paramMap.subscribe(params => {
      this.id = params.get('id');
        // Obtiene el parámetro 'id'
        if(this.id){
          this.getMap( parseInt(this.id));
        }
        else{
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
}
