import { ChangeDetectionStrategy, Component, EventEmitter, Input, OnChanges, Output } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Area } from '../../../../../models/maps/area';

@Component({
  selector: 'create-area',
  imports: [ReactiveFormsModule],
  template: `
  <div class="modal fade" id="createAreaModal" data-backdrop="static" data-keyboard="false" tabindex="-1" aria-labelledby="createAreaModalLabel" aria-hidden="true">
    <div class="modal-dialog modal-dialog-scrollable modal-lg">
        <div class="modal-content">
          <form [formGroup]="areaCreateForm" (ngSubmit)="clickPostAreaCreate()">
              <div class="modal-header">
                  <h4>Create Area</h4>
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
                        <div class="form-group">
                          <label for="editIcons">Color</label>
                          <div class="row p-2">
                            <div class="col-4">
                              <div class="row">
                                <div class="col-4">
                                  <h6>Text</h6>
                                </div>
                                <div class="col-8">
                                  <input type="color" formControlName='editColor' />
                                </div>
                              </div>
                            </div>
                            <div class="col-8">
                              <div class="row">
                                <div class="col-6">
                                <h6>BackGround</h6>
                                </div>
                                <div class="col-6">
                                  <input type="color"  formControlName='editBackGround' value="#ffffff" />
                                </div>
                              </div>
                            </div>
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
                  <button type="submit" class="btn btn-primary"  [disabled]="areaCreateForm.invalid">Create</button>
              </div>
          </form>
        </div>
    </div>
  </div>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreateAreaComponent  implements OnChanges{
 
  areaCreateLoading: boolean;
  areaCreateForm: FormGroup;
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

  area: Area | undefined;

  @Input()
  modal: any;
  @Input()
  coordinates: { y: number, x: number } | undefined;

  @Output()
  createAreaEvent = new EventEmitter<{ createArea: Area}>();

  constructor(private fb: FormBuilder) {
    this.areaCreateLoading = false;
    this.areaCreateForm = this.initFormat();
  }

  ngOnChanges(): void { 
    if (this.coordinates) {
    this.areaCreateForm.get('editX')?.setValue(this.coordinates.x);
    this.areaCreateForm.get('editY')?.setValue(this.coordinates.y);
    console.log(this.coordinates);
    }
  }

  initFormat(){
    return this.fb.group({
      editName: ['', Validators.required],
      editImg: [''],
      editDescription: [''],
      editColor: ['#000000', Validators.required],
      editBackGround: ['#ffffff', Validators.required],
      editIcon:[''],
      editSize: [12, Validators.required],
      editX: [0, Validators.required],
      editY: [0, Validators.required]
    });
  }

  clickPostAreaCreate() {
    alert("Area create");
    console.log('Formulario enviado:', this.areaCreateForm.value);
    this.postCreateArea();
  }

  closeModal() {
    this.modal.hide();
  }

  getIcon() {
    this.selectedIcon = this.areaCreateForm.get("editIcon")?.value;
  }

  postCreateArea(){
    //TODO: post service
    var id = 1000;

    //format data
    this.area = {
      id: id,
      name: this.areaCreateForm.get('editName')?.value,
      description: this.areaCreateForm.get('editDescriptio')?.value,
      img:  this.areaCreateForm.get('editImg')?.value,
      seats: [],
      tables: [],
      type: "",
      x:  this.areaCreateForm.get('editX')?.value,
      y:  this.areaCreateForm.get('editY')?.value,
      radio: 0,
      color:  this.areaCreateForm.get('editColor')?.value,
      size: this.areaCreateForm.get('editSize')?.value,
      backGround:  this.areaCreateForm.get('editBackGround')?.value,
      icon: this.areaCreateForm.get('editIcon')?.value,
      totalTables: 0,
      totalSeats: 0,
      totalCount: 0,
    }
    this.createAreaEvent.emit({createArea: this.area});
    this.areaCreateForm =  this.initFormat();
    this.closeModal();
  }
}
