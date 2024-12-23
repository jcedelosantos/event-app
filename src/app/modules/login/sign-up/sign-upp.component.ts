import {  ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, Router } from '@angular/router';
import { FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';

@Component({
  selector: 'app-sing-up',
  templateUrl: './sign-up.component.html',
  styleUrl: './sign-up.component.css',
  imports: [RouterLink, ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SignUpComponent {
  formGroupInput: FormGroup;
  status: string;

  constructor(private fb: FormBuilder, private router: Router) {
    this.formGroupInput = this.fb.group({
      username: new FormControl('', Validators.required,),
      password: new FormControl('', Validators.required),
    });
    this.status = '';

  }
  signUp(){
    alert("sign up post")
  }
}
