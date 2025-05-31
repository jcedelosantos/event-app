import { AfterViewInit, Component, signal } from '@angular/core';

declare const bootstrap: any;

@Component({
	selector: 'app-dash-board',
	imports: [],
	template: `
		@if (notification()) {
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
							<button type="button" class="ard-link btn btn-danger" data-bs-dismiss="modal">Create</button>
						</div>
					</div>
				</div>
			</div>
		}
	`,
	styleUrl: './dash-board.component.css',
})
export class DashBoardComponent implements AfterViewInit {
	notification = signal<boolean>(false);
	modalNotification: any;

	ngAfterViewInit(): void {
		this.getInitModal();
		if (this.notification()) {
			this.openNotificationModal();
		}
	}

	setNotification(value: boolean) {
		this.notification.set(value);
	}

	getInitModal() {
		const modalElement = document.getElementById('notificationModal');
		if (modalElement) {
			this.modalNotification = new bootstrap.Modal(modalElement);
		}
	}
	openNotificationModal() {
		this.modalNotification.show();
	}
}
