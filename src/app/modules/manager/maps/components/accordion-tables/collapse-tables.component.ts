import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { Table } from '../../../../../models/maps/table';
import { CollapseSeatsComponent } from "../collapse-seats/collapse-seats.component";

@Component({
  selector: 'collapse-tables',
  imports: [ CollapseSeatsComponent],
  template: `
  @if(tables){
    <div class="d-flex flex-row justify-content-around bg-black">
      <div class="p-2">
        <button class="btn position-relative" type="button" data-bs-toggle="collapse" attr.data-bs-target="#{{'collapseTables-' + id}}" aria-expanded="false">
            Tables
            <span class="badge rounded-pill bg-danger">{{tables.length }}</span>
        </button>
      </div>
      <div class="p-2">
        <button class="btn " type="button"><i class="bi bi-pencil"></i></button>
      </div>
      <div class="p-2">
        <button type="button" class="btn btn-sm "><i class="bi bi-x-lg"></i></button>
      </div>
    </div>
    <div class="collapse" [id]="'collapseTables-' + id">
      <ul class="list-group list-group-numbered ms-1 me-1">
        @for(table of tables; track table.id;  let idx = $index){
          <collapse-seats [seats]="table.seats" [id]="table.id"/>
        }
      </ul>
    </div>
  }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CollapseTablesComponent { 

  @Input()
  tables: Array<Table> = [];
  @Input()
  id: number = 0;
}
