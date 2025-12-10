import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-whatsapp-button',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="whatsapp-container">
      <!-- Temporariamente oculto
      <div class="whatsapp-bubble" [class.show]="mostrarBubble">
        {{ mensajeActual }}
      </div>
      -->
      <a 
        href="https://wa.me/34663356622" 
        target="_blank" 
        class="whatsapp-button"
        title="Contactar por WhatsApp"
      >
        <i class="fab fa-whatsapp"></i>
      </a>
    </div>
  `,
  styles: [`
    .whatsapp-container {
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 1000;
    }

    .whatsapp-button {
      background-color: #25D366;
      color: white;
      width: 60px;
      height: 60px;
      border-radius: 50%;
      display: flex;
      justify-content: center;
      align-items: center;
      text-decoration: none;
      box-shadow: 0 4px 8px rgba(0,0,0,0.2);
      transition: all 0.3s ease;

      i {
        font-size: 35px;
      }

      &:hover {
        transform: scale(1.1);
        box-shadow: 0 6px 12px rgba(0,0,0,0.3);
      }

      &:active {
        transform: scale(0.95);
      }
    }

    /* Temporariamente oculto
    .whatsapp-bubble {
      position: absolute;
      bottom: 70px;
      right: 0;
      background-color: white;
      padding: 12px 20px;
      border-radius: 20px;
      box-shadow: 0 4px 8px rgba(0,0,0,0.2);
      max-width: 250px;
      opacity: 0;
      transform: translateY(10px);
      transition: all 0.3s ease;
      pointer-events: none;
      font-size: 14px;
      color: #333;
      text-align: center;
      border: 1px solid #e0e0e0;

      &::after {
        content: '';
        position: absolute;
        bottom: -8px;
        right: 20px;
        width: 0;
        height: 0;
        border-left: 8px solid transparent;
        border-right: 8px solid transparent;
        border-top: 8px solid white;
      }

      &.show {
        opacity: 1;
        transform: translateY(0);
      }
    }
    */
  `]
})
export class WhatsappButtonComponent {
  // Temporariamente oculto
  /*
  mostrarBubble = false;
  mensajeActual = '';
  private mensajes = [
    '¿Ves algo mal? ¡Escríbenos!',
    '¡Ayúdanos a mejorar!',
    '¿Tienes alguna sugerencia?',
    '¿Encontraste algún error?',
    '¡Queremos escucharte!',
    '¿Cómo podemos mejorar?',
    '¿Algo no funciona? ¡Avísanos!',
    '¡Tu opinión nos importa!'
  ];
  private intervalId: any;

  ngOnInit() {
    this.cambiarMensaje();
    this.intervalId = setInterval(() => {
      this.cambiarMensaje();
    }, 5000);
  }

  ngOnDestroy() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
  }

  private cambiarMensaje() {
    const mensajeAnterior = this.mensajeActual;
    let nuevoMensaje;
    do {
      nuevoMensaje = this.mensajes[Math.floor(Math.random() * this.mensajes.length)];
    } while (nuevoMensaje === mensajeAnterior && this.mensajes.length > 1);
    
    this.mensajeActual = nuevoMensaje;
  }
  */
} 