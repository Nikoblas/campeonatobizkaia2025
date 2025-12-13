import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { LoadingSpinnerComponent } from './components/loading-spinner/loading-spinner.component';
import { CompetitionService } from './services/competition.service';
import { TranslateService } from './services/translate.service';
import { Observable, combineLatest } from 'rxjs';
import { map } from 'rxjs/operators';
import { WhatsappButtonComponent } from './components/whatsapp-button/whatsapp-button.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    LoadingSpinnerComponent,
    WhatsappButtonComponent,
  ],
  template: `
    <app-loading-spinner *ngIf="!(todoListo$ | async)"></app-loading-spinner>
    <div *ngIf="errorCarga$ | async as error" class="error-message">
      {{ error }}
    </div>
    <router-outlet *ngIf="todoListo$ | async"></router-outlet>
    <app-whatsapp-button></app-whatsapp-button>
  `,
  styles: [
    `
      .error-message {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background-color: #ff4444;
        color: white;
        padding: 20px;
        border-radius: 5px;
        text-align: center;
        z-index: 10000;
      }
    `,
  ],
})
export class AppComponent implements OnInit {
  title = 'campeonato';
  categoriaSeleccionada: string = '0.65m';
  categorias: string[] = ['0.65m', '0.80m', '1.00m', '1.10m', '1.20m', '1.30m'];

  mostrarPopupResultados = false;

  datosListos$: Observable<boolean>;
  traduccionesListas$: Observable<boolean>;
  todoListo$: Observable<boolean>;
  errorCarga$: Observable<string | null>;

  constructor(
    private competitionService: CompetitionService,
    private translateService: TranslateService
  ) {
    this.datosListos$ = this.competitionService.datosListos$;
    this.traduccionesListas$ = this.translateService.getTranslationsLoaded$();
    this.todoListo$ = combineLatest([
      this.datosListos$,
      this.traduccionesListas$
    ]).pipe(
      map(([datosListos, traduccionesListas]) => datosListos && traduccionesListas)
    );
    this.errorCarga$ = this.competitionService.errorCarga;
  }

  ngOnInit() {
    // La carga de datos ya se inicia en el constructor del servicio
  }

  cambiarCategoria(categoria: string) {
    this.categoriaSeleccionada = categoria;
  }

  abrirPopupResultados() {
    this.mostrarPopupResultados = true;
  }

  cerrarPopupResultados() {
    this.mostrarPopupResultados = false;
  }
}
