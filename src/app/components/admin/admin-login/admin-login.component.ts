import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslateService } from '../../../services/translate.service';
import { TranslatePipe } from '../../../pipes/translate.pipe';

@Component({
  selector: 'app-admin-login',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe],
  templateUrl: './admin-login.component.html',
  styleUrls: ['./admin-login.component.scss'],
})
export class AdminLoginComponent {
  password: string = '';
  error: string = '';

  constructor(
    private router: Router,
    private translateService: TranslateService
  ) {}

  // Método helper para traducir en el componente
  t(key: string, params?: { [key: string]: string }): string {
    return this.translateService.translate(key, params);
  }

  login() {
    if (this.password === 'campeonato2025') {
      localStorage.setItem('adminAuth', 'true');
      this.router.navigate(['/admin/dashboard']);
    } else {
      this.error = this.t('admin.login.wrongPassword');
      this.password = '';
    }
  }

  volverAResultados() {
    this.router.navigate(['/']);
  }
}
