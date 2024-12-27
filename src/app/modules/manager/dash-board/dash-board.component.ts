import { ChangeDetectionStrategy, Component, AfterViewInit } from '@angular/core';
import { Router } from '@angular/router';

declare var bootstrap: any;

@Component({
  selector: 'app-dash-board',
  imports: [],
  template: `
  @if(notification){
    <div class="modal" id="notificationModal" data-backdrop="static" data-keyboard="false" tabindex="-1" aria-labelledby="notificationModalLabel" aria-hidden="true">
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">Notification</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body">
            <p>You do not have any events in progress at the moment, would you like to create one?</p>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
            <button type="button" class="ard-link btn btn-danger" (click)="openEventModuleCreate()">Create</button>
          </div>
        </div>
      </div>
    </div>
  }
  `,
  styleUrl: './dash-board.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashBoardComponent implements  AfterViewInit {
  notification: boolean = true;
  modalNotification: any;
  constructor(private router: Router) { }

  ngAfterViewInit(): void {
    this.getInitModal();
    if(this.notification){
      this.openNotificationModal()
    }
  }
  
  setNotification(value: boolean) {
    this.notification = value;
  }

  getInitModal() {
    var modalElement = document.getElementById('notificationModal');
    if (modalElement) {
      this.modalNotification = new bootstrap.Modal(modalElement);
    }
  }
  
  openNotificationModal() {
    this.modalNotification.show();
  }

  closeNotificationModal() {
    this.modalNotification.hidden();
  }

  openEventModuleCreate(){
    this['router'].navigate(['/manager/events']);
    this.closeNotificationModal();
  }

}
