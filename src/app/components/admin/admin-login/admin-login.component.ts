import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

@Component({
  selector: 'app-admin-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-login.component.html',
  styleUrls: ['./admin-login.component.scss'],
})
export class AdminLoginComponent {
  password: string = '';
  error: string = '';

  constructor(private router: Router) {}

  login() {
    if (this.password === 'campeonato2025') {
      localStorage.setItem('adminAuth', 'true');
      this.router.navigate(['/admin/dashboard']);
    } else {
      this.error = 'Contraseña incorrecta';
      this.password = '';
    }
  }

  volverAResultados() {
    this.router.navigate(['/']);
  }
}
