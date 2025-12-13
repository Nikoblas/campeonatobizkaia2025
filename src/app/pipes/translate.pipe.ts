import { Pipe, PipeTransform, ChangeDetectorRef, OnDestroy } from '@angular/core';
import { TranslateService } from '../services/translate.service';
import { Subscription } from 'rxjs';

@Pipe({
  name: 'translate',
  standalone: true,
  pure: false // Para que se actualice cuando cambien las traducciones
})
export class TranslatePipe implements PipeTransform, OnDestroy {
  private cache: Map<string, string> = new Map();
  private subscription?: Subscription;
  private translationsLoaded: boolean = false;
  private pendingKeys: Set<string> = new Set();

  constructor(
    private translateService: TranslateService,
    private changeDetectorRef: ChangeDetectorRef
  ) {
    // Suscribirse a cambios en las traducciones
    this.subscription = this.translateService.getTranslationsLoaded$().subscribe((loaded) => {
      const wasLoaded = this.translationsLoaded;
      this.translationsLoaded = loaded;
      
      if (loaded) {
        // Limpiar el cache cuando se cargan nuevas traducciones (cambio de idioma)
        if (wasLoaded) {
          this.cache.clear();
        }
        
        // Actualizar todas las claves pendientes o todas las del cache
        const keysToUpdate = this.pendingKeys.size > 0 ? Array.from(this.pendingKeys) : Array.from(this.cache.keys());
        
        keysToUpdate.forEach(key => {
          const [translationKey, paramsStr] = key.split('|||');
          const params = paramsStr ? JSON.parse(paramsStr) : undefined;
          this.cache.set(key, this.translateService.translate(translationKey, params));
        });
        
        this.pendingKeys.clear();
        this.changeDetectorRef.markForCheck();
      }
    });
  }

  transform(key: string, params?: { [key: string]: string }): string {
    if (!key) {
      return '';
    }

    // Crear una clave única para el cache
    const cacheKey = key + '|||' + (params ? JSON.stringify(params) : '');

    // Si las traducciones ya están cargadas, traducir directamente
    if (this.translationsLoaded) {
      // Siempre traducir para asegurar que tenemos la última versión
      const translated = this.translateService.translate(key, params);
      this.cache.set(cacheKey, translated);
      return translated;
    }

    // Si las traducciones aún no están cargadas
    if (!this.cache.has(cacheKey)) {
      this.pendingKeys.add(cacheKey);
      this.cache.set(cacheKey, key); // Mostrar la clave temporalmente
    }

    return this.cache.get(cacheKey) || key;
  }

  ngOnDestroy(): void {
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
    this.cache.clear();
    this.pendingKeys.clear();
  }
}

