import { ChangeDetectionStrategy, Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Area } from '../../../../../models/maps/area';

@Component({
  selector: 'update-area',
  imports: [ReactiveFormsModule],
  template: `
    <div class="modal fade" id="updateAreaModal" data-backdrop="static" data-keyboard="false" tabindex="-1" aria-labelledby="updateAreaModalLabel" aria-hidden="true">
      <div class="modal-dialog modal-dialog-scrollable modal-lg">
          <div class="modal-content">
            <form [formGroup]="areaUpdateForm" (ngSubmit)="clickPostAreaUpdate()">
                <div class="modal-header">
                    <h4>Update Area</h4>
                </div>
                <div class="modal-body">
                    <div class="row">
                        <div class="col-md-4 mb-2">
                            <h6>Name *</h6>
                            <div class="input-group">
                              <input type="text" minlength="3" maxlength="12" class="form-control" formControlName='editName' placeholder="Name Area input">
                            </div>
                        </div>
                      
                        <div class="col-md-8 mb-4">
                            <h6>Description</h6>
                            <input type="text" class="form-control" formControlName='editDescription' minlength="0"  maxlength="100" placeholder="Name Description input">
                        </div>

                        <div class="col-md-2 mb-2">
                            <h6>Y</h6>
                            <input type="number" min="1" max="10000" class="form-control" formControlName='editX'  placeholder="0.0">
                        </div>
                        
                        <div class="col-md-2 mb-2">
                            <h6>Y</h6>
                            <input type="number" min="1" max="10000" class="form-control" formControlName='editX' placeholder="0.0">
                        </div>

                        <div class="col-md-2 mb-2">
                            <h6>Size</h6>
                            <input type="number" min="1" max="32" class="form-control" formControlName='editSize'  placeholder="0">
                        </div>

                        <div class="col-md-6 mb-2">
                          <div class="row">
                            <div class="col-4">
                              <label for="colorInput" class="form-label">Text</label>
                              <input type="color" class="form-control form-control-color" id="colorInput"  formControlName='editColor'>
                            </div>
                            <div class="col-8">
                              <label for="colorBackInput" class="form-label">BackGround</label>
                              <input type="color" class="form-control form-control-color" id="colorBackInput"  formControlName='editBackGround'>
                            </div>
                          </div>
                        </div>
                      
                        <div class="col-md-4 mb-2">
                          <div class="form-group">
                            <label for="editIcons">Icons</label>
                            <div class="row p-2">
                              <div class="col-8">
                                <select id="editIcon" class="form-control " name="editIcon" formControlName="editIcon"  (change)="getIcon()" >
                                    @for (icon of icons; track $index) {
                                    <option [value]="icon.value">
                                      {{ icon.label }}
                                    </option>
                                    }
                                </select>
                              </div>
                              <div class="col-4 mt-2">
                                @if(selectedIcon){
                                  <i class="bi {{selectedIcon}}"></i>
                                }
                                @else {
                                  <i class="bi bi-dash-lg"></i>
                                }
                              </div>
                            </div>
                          </div>
                        </div>

                        <div class="col-md-8 mb-2">
                          <label for="formFile" class="form-label">Image</label>
                          <input class="form-control" type="file" id="formFile" formControlName='editImg'>
                        </div>

                    </div>
                    <div class="col-12">
                        <!-- <app-loading-container [loading]="terminalsCreateLoading"/> -->
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" (click)="closeModal()">Cerrar</button>
                    <button type="submit" class="btn btn-primary"  [disabled]="areaUpdateForm.invalid">Update</button>
                </div>
            </form>
          </div>
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})

export class UpdateAreaComponent implements OnChanges {
  areaUpdateLoading: boolean;
  areaUpdateForm: FormGroup;
  icons = [
    { label: '', value: '' },
    { label: 'Curso', value: 'bi-input-cursor' },
    { label: 'Resize', value: 'bi-textarea-resize' },
    { label: 'Textarea', value: 'bi-textarea' },
    { label: 'Map', value: 'bi bi-map' },
    { label: 'Geo', value: 'bi-geo' },
    { label: 'Table', value: 'bi-table' },
    { label: 'Bank', value: 'bi-bank' }
  ];
  selectedIcon: string = this.icons[0].value;

  @Input()
  modal: any;

  @Input()
  area: Area | undefined;

  @Output()
  updateAreaEvent = new EventEmitter<{ updateArea: Area }>();

  constructor(private fb: FormBuilder) {
    this.areaUpdateLoading = false;
    this.areaUpdateForm = this.initFormat();
  }

  ngOnChanges(changes: SimpleChanges): void {
    this.addArea();
  }

  initFormat() {
    return this.fb.group({
      editName: ['', Validators.required],
      editImg: [''],
      editDescription: [''],
      editColor: ['#000000', Validators.required],
      editBackGround: ['#ffffff', Validators.required],
      editIcon: [''],
      editSize: [12, Validators.required],
      editX: [0, Validators.required],
      editY: [0, Validators.required]
    });
  }
  addArea(){
    if (this.area) {
      this.areaUpdateForm = this.fb.group({
        editName: [this.area.name, Validators.required],
        editImg: [this.area.img],
        editDescription: [this.area.description],
        editColor: [this.area.color, Validators.required],
        editBackGround: [this.area.backGround, Validators.required],
        editIcon: [this.area.icon],
        editSize: [this.area.size, Validators.required],
        editX: [this.area.x, Validators.required],
        editY: [this.area.y, Validators.required]
      });
      this.selectedIcon = this.area.icon;
    }
  }

  clickPostAreaUpdate() {
    alert("Area Update");
    console.log('Formulario enviado:', this.areaUpdateForm.value);
    this.postUpdateArea();
  }

  closeModal() {
    this.modal.hide();
    this.addArea();
  }

  getIcon() {
    this.selectedIcon = this.areaUpdateForm.get("editIcon")?.value;
  }

  postUpdateArea() {
    //TODO: post service

    //format data
    if (this.area) {
      this.area = {
        id: this.area.id,
        description: this.areaUpdateForm.get('editDescription')?.value,
        name: this.areaUpdateForm.get('editName')?.value,
        img: this.areaUpdateForm.get('editImg')?.value,
        seats: this.area.seats ? this.area.seats : [],
        tables: this.area.tables ? this.area.tables : [],
        type: "",
        x: this.areaUpdateForm.get('editX')?.value,
        y: this.areaUpdateForm.get('editY')?.value,
        radio: 0,
        color: this.areaUpdateForm.get('editColor')?.value,
        size: this.areaUpdateForm.get('editSize')?.value,
        backGround: this.areaUpdateForm.get('editBackGround')?.value,
        icon: this.areaUpdateForm.get('editIcon')?.value,
        totalTables: this.area.totalTables,
        totalSeats: this.area.totalSeats,
        totalCount: this.area.totalCount,
      }
      this.updateAreaEvent.emit({ updateArea: this.area });
    }
    this.closeModal();
  }
}
