import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject } from 'rxjs';
import { map } from 'rxjs/operators';

export interface Translations {
  [key: string]: string | Translations;
}

@Injectable({
  providedIn: 'root'
})
export class TranslateService {
  private translations: Translations = {};
  private currentLang: string = 'es';
  private translationsLoaded$ = new BehaviorSubject<boolean>(false);

  constructor(private http: HttpClient) {
    // Cargar idioma guardado o usar español por defecto
    const idiomaGuardado = localStorage.getItem('idiomaSeleccionado') || 'es';
    this.loadTranslations(idiomaGuardado);
  }

  /**
   * Carga las traducciones desde un archivo JSON
   */
  loadTranslations(lang: string): void {
    // Primero marcar como no cargado para que el pipe se actualice
    this.translationsLoaded$.next(false);
    
    this.http.get<Translations>(`/assets/i18n/${lang}.json`).subscribe({
      next: (translations) => {
        this.translations = translations;
        this.currentLang = lang;
        this.translationsLoaded$.next(true);
      },
      error: (error) => {
        console.error(`Error al cargar traducciones para ${lang}:`, error);
        // Si falla, intentar cargar español como fallback
        if (lang !== 'es') {
          this.loadTranslations('es');
        } else {
          // Si incluso español falla, usar objeto vacío
          this.translations = {};
          this.translationsLoaded$.next(true);
        }
      }
    });
  }

  /**
   * Obtiene la traducción de una clave
   * Soporta claves anidadas con notación de punto (ej: 'common.buttons.save')
   */
  translate(key: string, params?: { [key: string]: string }): string {
    const keys = key.split('.');
    let value: any = this.translations;

    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        // Si no se encuentra la traducción, devolver la clave
        return key;
      }
    }

    if (typeof value !== 'string') {
      return key;
    }

    // Reemplazar parámetros si existen
    if (params) {
      return value.replace(/\{\{(\w+)\}\}/g, (match, paramKey) => {
        return params[paramKey] || match;
      });
    }

    return value;
  }

  /**
   * Método corto para traducir (alias de translate)
   */
  t(key: string, params?: { [key: string]: string }): string {
    return this.translate(key, params);
  }

  /**
   * Obtiene el idioma actual
   */
  getCurrentLang(): string {
    return this.currentLang;
  }

  /**
   * Observable que indica si las traducciones están cargadas
   */
  getTranslationsLoaded$(): Observable<boolean> {
    return this.translationsLoaded$.asObservable();
  }
}

