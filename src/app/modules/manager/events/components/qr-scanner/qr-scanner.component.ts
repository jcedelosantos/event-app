import { Component, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';

@Component({
  selector: 'app-qr-scanner',
  imports: [ReactiveFormsModule],
  templateUrl: './qr-scanner.component.html',
  styleUrl: './qr-scanner.component.css'
})
export class QrScannerComponent {

  scannerForm = new FormGroup({ code: new FormControl<string>('', [Validators.required]) })


  lastActions = signal<string[]>([
  ]);

  onSubmit() {
    const code = this.scannerForm.value.code;
    if (code) {
      // Simulate a successful scan
      this.lastActions.update(actions => [...actions, `Registrado evento Evento X con código ${code}`]);
      this.scannerForm.reset();
    }
  }

  validateExistentCode() {
    const code = this.scannerForm.value.code;
    if (code) {
      // Simulate a validation check
      const exists = Math.random() < 0.5; // Randomly simulate existence
      if (exists) {
        this.lastActions.update(actions => [...actions, `El código ${code} ya existe`]);
      } else {
        this.lastActions.update(actions => [...actions, `El código ${code} es válido`]);
      }
    }
  }

}
