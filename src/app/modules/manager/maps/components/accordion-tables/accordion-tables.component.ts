import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { Table } from '../../../../../models/maps/table';
import { AccordionSeatsComponent } from "../accordion-seats/accordion-seats.component";

@Component({
  selector: 'accordion-tables',
  imports: [AccordionSeatsComponent],
  template: `
  @if(tables){
    <div class="accordion accordion-flush p-2 " [id]="'accordionFlushTables' + id" >
      <div class="accordion-item">
        <h2 class="accordion-header" [id]="'flush-headingTables' + id">
          <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#flush-collapseTables" aria-expanded="false" aria-controls="flush-collapseTables">
            <div class="row">
              <div class="col-6">
                  Tables
              </div>
              <div class="col-6">
                  <span class="badge bg-primary rounded-pill">{{tables.length}}</span> 
              </div>
            </div>
          </button>
        </h2>
        <div id="flush-collapseTables" class="accordion-collapse collapse" attr.aria-labelledby="{{'flush-headingTables' + id}}" attr.data-bs-parent="#{{'accordionFlushTables' + id}}">
          @for(table of tables; track table.id;  let idx = $index){
              <accordion-seats [seats]="table.seats" [id]="table.id"/>
          }
        </div>
      </div>
    </div>
  }

  `,
  styleUrl: './accordion-tables.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccordionTablesComponent { 

  @Input()
  tables: Array<Table> = [];
  @Input()
  id: number = 0;
}
