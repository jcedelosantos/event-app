import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { Seat } from '../../../../../models/maps/seat';

@Component({
  selector: 'accordion-seats',
  imports: [],
  template: `
  @if(seats){
    <div class="accordion accordion-flush p-2" [id]="'accordionFlushSeats-' + id">
     <div class="accordion-item">
       <h2 class="accordion-header" [id]="'flush-headingSeats-' + id">
      
         <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#flush-collapseSeats" aria-expanded="false" aria-controls="flush-collapseSeats">
           <div class="row">
             <div class="col-6">
                 Seats
             </div>
             <div class="col-3">
              <span class="badge bg-primary rounded-pill">{{seats.length}}</span> 
             </div>
             <div class="col-3 d-fled">
                 
             </div>
           </div>
         </button>
       </h2>
       <div id="flush-collapseSeats" class="accordion-collapse collapse" attr.aria-labelledby="{{'flush-headingSeats' + id}}" attr.data-bs-parent="#{{ 'accordionFlushSeats-' + id }}">
         <div class="accordion-body">
           <ul class="list-group">
                  @for(seat of seats; track seat.id;  let idx = $index){
                    <li class="list-group-item d-flex justify-content-between align-items-center">
                      {{seat.name}}
                      <button type="button" class="btn btn-sm"><i class="bi bi-x-circle-fill"></i></button>
                    </li>
              }
              </ul>
           </div>
       </div>
     </div>
   </div>
  }
  `,
  styleUrl: './accordion-seats.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccordionSeatsComponent { 

  @Input()
  seats: Array<Seat> = [];
  @Input()
  id: number = 0;
}
