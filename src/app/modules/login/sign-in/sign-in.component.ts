import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { RouterLink, Router } from '@angular/router';
import { FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';

import { users } from '../../../data/users';
import { User } from '../../../models/users/user';

@Component({
  selector: 'app-sign-in',
  templateUrl: './sign-in.component.html',
  styleUrl: './sign-in.component.css',
  imports: [RouterLink, ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SignInComponent implements OnInit {
  users: Array<User> | undefined;
  formGroupInput: FormGroup;
  status: string;

  constructor(private fb: FormBuilder, private router: Router) {
    this.formGroupInput = this.fb.group({
      username: new FormControl('', Validators.required,),
      password: new FormControl('', Validators.required),
      save: new FormControl(false),
    });
    this.status = '';

  }
  ngOnInit(): void {
    this.users = users;
  }

  signIn() {
    if (this.formGroupInput.valid && this.users) {
      var find: boolean = false;
      for (var i = 0; i < this.users.length; i++) {
        if (this.users[i].username === this.formGroupInput.get('username')?.value && this.users[i].password === this.formGroupInput.get('password')?.value) {
          console.log("true");
          this['router'].navigate(['/manager/dash-board']);
          find = true;
          break;
        }
      }
      if (!find) {
       this.status = "username or password incorrect"
      }

    }
    else {
      this.status = "Please fill in the fields"
    }

  }
}
