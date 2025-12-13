import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import {
  CompetitionService,
  EquipoEntry,
} from '../../services/competition.service';
import { TranslateService } from '../../services/translate.service';
import { TranslatePipe } from '../../pipes/translate.pipe';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, Subscription } from 'rxjs';
import * as XLSX from 'xlsx';

interface CompetitionDay {
  puntos: number | string;
  caballo: string;
  tiempo: string;
  cl: string;
  tachado?: boolean;
}

interface CompetitionData {
  clasificacion: number;
  nombreJinete: string;
  caballo: string;
  club: string;
  total: number;
  sabado: CompetitionDay;
  domingo: CompetitionDay;
  desempate: CompetitionDay;
  resultadosValidos: number;
  mostrarClasificacion: boolean;
  eliminaciones: number; // Nuevo atributo para contar eliminaciones
}

@Component({
  selector: 'app-competition-table',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, TranslatePipe],
  templateUrl: './competition-table.component.html',
  styleUrls: ['./competition-table.component.scss'],
})
export class CompetitionTableComponent implements OnInit, OnDestroy {
  categorias: string[] = [];
  categoriaSeleccionada: string = 'inicio';
  datos: CompetitionData[] = [];
  cargando: boolean = false;
  idiomas: { codigo: string; nombre: string }[] = [
    { codigo: 'es', nombre: 'Español' },
    { codigo: 'eus', nombre: 'Euskera' }
  ];
  idiomaSeleccionado: string = 'es';
  private subscriptions: Subscription[] = [];

  // Grupos de categorías compatibles (ya no aplica con las nuevas categorías)
  private gruposCategorias = {
    grupo1: [],
    grupo2: [],
    grupo3: [],
  };

  constructor(
    private competitionService: CompetitionService,
    private translateService: TranslateService,
    private http: HttpClient,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  // Método helper para traducir en el componente
  t(key: string, params?: { [key: string]: string }): string {
    return this.translateService.translate(key, params);
  }

  getCategoriaVisual(categoria: string): string {
    return this.competitionService.getCategoriaVisual(categoria);
  }

  ngOnInit() {
    this.categorias = this.competitionService.getCategorias();
    
    // Cargar idioma guardado o usar el idioma actual del servicio
    const idiomaGuardado = localStorage.getItem('idiomaSeleccionado');
    if (idiomaGuardado && this.idiomas.some(i => i.codigo === idiomaGuardado)) {
      this.idiomaSeleccionado = idiomaGuardado;
    } else {
      this.idiomaSeleccionado = this.translateService.getCurrentLang();
    }
    
    // Inicializar datos como array vacío para que el mensaje de estado vacío funcione
    this.datos = [];

    // Leer la categoría de la URL
    const categoriaFromUrl = this.route.snapshot.url.length > 0 
      ? this.route.snapshot.url[0].path 
      : '';
    
    // Verificar si la categoría de la URL es válida
    if (categoriaFromUrl && this.categorias.includes(categoriaFromUrl)) {
      this.categoriaSeleccionada = categoriaFromUrl;
    } else {
      // Si no hay categoría en la URL o no es válida, usar 'inicio' o la guardada
      const categoriaGuardada = localStorage.getItem('categoriaSeleccionada');
      if (categoriaGuardada && categoriaGuardada !== 'inicio' && this.categorias.includes(categoriaGuardada)) {
        this.categoriaSeleccionada = categoriaGuardada;
        localStorage.removeItem('categoriaSeleccionada');
      } else {
        this.categoriaSeleccionada = 'inicio';
      }
    }

    // Suscribirse a cambios en la ruta para actualizar cuando cambie la URL
    // Usar un flag para evitar cargar datos dos veces cuando se accede directamente por URL
    let datosYaCargados = false;
    
    const routeSub = this.route.url.subscribe(urlSegments => {
      const nuevaCategoria = urlSegments.length > 0 ? urlSegments[0].path : '';
      
      if (nuevaCategoria && this.categorias.includes(nuevaCategoria)) {
        this.categoriaSeleccionada = nuevaCategoria;
        this.datos = []; // Resetear datos al cambiar de categoría
        // Solo cargar datos si ya están listos (cuando se cambia de ruta después de cargar)
        // Si se accede directamente por URL, la suscripción a datosListos$ se encargará
        if (datosYaCargados) {
          this.cargarDatos();
        }
      } else if (nuevaCategoria === '' && this.categoriaSeleccionada !== 'inicio') {
        this.categoriaSeleccionada = 'inicio';
        this.datos = []; // Resetear datos al cambiar a inicio
      }
    });
    this.subscriptions.push(routeSub);

    // Suscribirse a cuando los datos estén listos
    const datosSub = this.competitionService.datosListos$.subscribe((ready) => {
      if (ready) {
        datosYaCargados = true;
        // Solo cargar datos si no estamos en 'inicio'
        if (this.categoriaSeleccionada !== 'inicio') {
          this.cargarDatos();
        } else {
          // Si estamos en inicio, asegurarse de que datos esté vacío
          this.datos = [];
        }
        this.cargando = false;
      }
    });
    this.subscriptions.push(datosSub);

    const errorSub = this.competitionService.errorCarga.subscribe((error) => {
      if (error) {
        console.error('Error al cargar datos:', error);
        this.cargando = false;
        alert(error);
      }
    });
    this.subscriptions.push(errorSub);
  }

  ngOnDestroy() {
    this.subscriptions.forEach((sub) => sub.unsubscribe());
  }

  cambiarCategoria() {
    if (this.categoriaSeleccionada !== 'inicio') {
      // Navegar a la ruta correspondiente a la categoría
      this.router.navigate(['/' + this.categoriaSeleccionada]);
      this.cargarDatos();
    } else {
      // Si es 'inicio', navegar a la raíz
      this.router.navigate(['/']);
    }
  }

  seleccionarCategoria(categoria: string) {
    this.categoriaSeleccionada = categoria;
    // Navegar a la ruta correspondiente a la categoría
    if (categoria === 'inicio') {
      this.router.navigate(['/']);
    } else {
      this.router.navigate(['/' + categoria]);
    }
    this.cargarDatos();
  }

  cambiarIdioma() {
    localStorage.setItem('idiomaSeleccionado', this.idiomaSeleccionado);
    this.translateService.loadTranslations(this.idiomaSeleccionado);
  }

  refrescarDatos() {
    const categoriaAnterior = this.categoriaSeleccionada;
    localStorage.setItem('categoriaSeleccionada', categoriaAnterior);
    window.location.reload();
  }

  abrirEquipe(showId: string) {
    window.open(`https://online.equipe.com/shows/${showId}`, '_blank');
  }

  async descargarPDF(concurso: string) {
    try {
      const url = `assets/data/${concurso}.pdf`;
      const response = await firstValueFrom(
        this.http.get(url, { responseType: 'blob' })
      );
      const blob = new Blob([response], { type: 'application/pdf' });
      const link = document.createElement('a');
      link.href = window.URL.createObjectURL(blob);
      link.download = `concurso-${concurso}.pdf`;
      link.click();
      window.URL.revokeObjectURL(link.href);
    } catch (error) {
      console.error('Error al descargar el PDF:', error);
      alert(this.t('errors.downloadPdf'));
    }
  }

  private normalizeRow(row: any): any {
    const mapped = { ...row };
    if (mapped['Lic'] !== undefined && mapped['Licencia'] === undefined) {
      mapped['Licencia'] = mapped['Lic'];
    }
    if (mapped['Faltas'] !== undefined && mapped['Puntos'] === undefined) {
      mapped['Puntos'] = mapped['Faltas'];
    }
    if (mapped['TIempo'] !== undefined && mapped['Tiempo'] === undefined) {
      mapped['Tiempo'] = mapped['TIempo'];
    }
    if (
      mapped['Posicion'] !== undefined &&
      mapped['Cl'] === undefined &&
      mapped['CL'] === undefined &&
      mapped['cl'] === undefined
    ) {
      mapped['Cl'] = mapped['Posicion'];
      mapped['CL'] = mapped['Posicion'];
      mapped['cl'] = mapped['Posicion'];
    }
    if (mapped['No. caballo'] !== undefined && mapped['Dorsal'] === undefined) {
      mapped['Dorsal'] = mapped['No. caballo'];
    }
    return mapped;
  }

  cargarDatos() {
    // Si la categoría es 'inicio', no cargar datos
    if (this.categoriaSeleccionada === 'inicio') {
      this.datos = [];
      return;
    }

    // Asegurarse de que datos esté inicializado como array vacío antes de procesar
    this.datos = [];

    const concurso = 'SEDE';
    const datosConcurso =
      this.competitionService.getAllCompetitionData(concurso);
    const pruebas = [
      { key: 'sabado', dia: 'SABADO' },
      { key: 'domingo', dia: 'DOMINGO' },
      { key: 'desempate', dia: 'DESEMPATE' },
    ];

    const datosCategoria = datosConcurso.filter(
      (d) => d.categoria === this.categoriaSeleccionada
    );
    // Verificar si todos los días principales tienen datos
    const diasConDatos = datosCategoria.filter(
      (d) =>
        ['SABADO', 'DOMINGO'].includes(d.dia) &&
        d.datos &&
        d.datos.length > 0
    ).length;
    const todosLosDiasCompletos = diasConDatos === 2;

    const jinetesMap: { [licencia: string]: any } = {};

    for (const prueba of pruebas) {
      const datosPrueba = datosCategoria.find((d) => d.dia === prueba.dia);
      if (datosPrueba && datosPrueba.datos) {
        const filasPorLicencia: { [lic: string]: any[] } = {};
        for (const filaRaw of datosPrueba.datos) {
          const fila = this.normalizeRow(filaRaw);
          const licencia =
            fila['Licencia'] ||
            fila['Lic'] ||
            fila['lic'] ||
            fila['LIC'] ||
            fila['LICENCIA'] ||
            fila['licencia'] ||
            '';
          if (!licencia) continue;
          if (!filasPorLicencia[licencia]) filasPorLicencia[licencia] = [];
          filasPorLicencia[licencia].push(fila);
        }
        for (const licencia in filasPorLicencia) {
          const filas = filasPorLicencia[licencia];
          const filaElegida = filas.reduce((min, actual) => {
            const osMin = parseInt(
              min['O.S.'] ||
                min['OS'] ||
                min['O S'] ||
                min['o.s.'] ||
                min['os'] ||
                '9999',
              10
            );
            const osAct = parseInt(
              actual['O.S.'] ||
                actual['OS'] ||
                actual['O S'] ||
                actual['o.s.'] ||
                actual['os'] ||
                '9999',
              10
            );
            return osAct < osMin ? actual : min;
          }, filas[0]);
          if (!jinetesMap[licencia]) {
            jinetesMap[licencia] = {
              nombreJinete:
                filaElegida['Atleta'] ||
                filaElegida['Jinete'] ||
                filaElegida['NOMBRE JINETE'] ||
                '',
              caballo:
                filaElegida['Caballo'] ||
                filaElegida['CABALLO'] ||
                filaElegida['caballo'] ||
                filaElegida['Cab'] ||
                filaElegida['CAB'] ||
                filaElegida['cab'] ||
                '',
              club:
                filaElegida['Club'] ||
                filaElegida['CLUB'] ||
                filaElegida['club'] ||
                '',
            };
          }
          const puntosOriginal = filaElegida['Faltas'] ?? filaElegida['Puntos'];

          // Verificar si es eliminación en el valor original
          const esEliminacion =
            puntosOriginal &&
            ['EL', 'E', 'R', 'ELI', 'RET', 'NC'].includes(
              ('' + puntosOriginal).toUpperCase()
            );

          let puntosMostrar: number | string;
          let clMostrar: string;

          if (esEliminacion) {
            // Para eliminaciones, buscar el peor resultado de la categoría + 20
            puntosMostrar = this.procesarPuntosEliminadoIndividual(
              puntosOriginal,
              licencia,
              datosConcurso,
              this.categoriaSeleccionada,
              prueba.dia
            );
            clMostrar = ('' + puntosOriginal).toUpperCase();
          } else {
            // Para puntos normales, convertir a número si es posible
            const puntosNum =
              typeof puntosOriginal === 'number'
                ? puntosOriginal
                : typeof puntosOriginal === 'string' &&
                  !isNaN(Number(puntosOriginal))
                ? Number(puntosOriginal)
                : puntosOriginal;
            puntosMostrar = puntosNum ?? 0; // Si no hay resultado, usar 0
            clMostrar =
              filaElegida['Cl'] ||
              filaElegida['CL'] ||
              filaElegida['cl'] ||
              filaElegida['Posicion'] ||
              '-';
          }
          jinetesMap[licencia][prueba.key] = {
            puntos:
              prueba.key === 'desempate'
                ? puntosOriginal ?? '-'
                : puntosMostrar,
            puntosOriginal: puntosOriginal, // Guardar puntos originales para verificación
            tiempo: filaElegida['Tiempo'] ?? filaElegida['TIempo'] ?? '-',
            caballo: filaElegida['Caballo'] ?? '-',
            cl: clMostrar,
          };
        }
      }
    }
    
    const listadoJinetes = Object.keys(jinetesMap)
      .map((licencia) => {
        const jinete = jinetesMap[licencia];
        for (const p of ['sabado', 'domingo', 'desempate']) {
          if (!jinete[p]) {
            jinete[p] = { puntos: '-', tiempo: '-', caballo: '-', cl: '-' };
          }
        }

        // Verificar que el jinete corrió sábado
        // Un jinete ha corrido si tiene datos (incluso con 0 puntos)
        const corrioSabado = jinete.sabado && jinete.sabado.puntos !== '-';

        // Verificar si existe archivo de domingo para esta categoría
        const existeDomingo = datosCategoria.some(
          (d) => d.dia === 'DOMINGO' && d.datos && d.datos.length > 0
        );

        // Si existe domingo, también debe haber corrido domingo
        let corrioDomingo = true; // Por defecto true si no existe archivo de domingo
        if (existeDomingo) {
          corrioDomingo = jinete.domingo && jinete.domingo.puntos !== '-';
        }

        // Si no corrió sábado o domingo (si existe), excluir de la clasificación
        if (!corrioSabado || !corrioDomingo) {
          return null; // Será filtrado después
        }

        // Contar eliminaciones (E, EL, ELI, RET, NC) usando puntos originales
        let eliminaciones = 0;
        for (const p of ['sabado', 'domingo']) {
          const puntosOriginales = jinete[p]?.puntosOriginal;
          if (
            typeof puntosOriginales === 'string' &&
            ['EL', 'E', 'R', 'ELI', 'RET', 'NC'].includes(puntosOriginales.toUpperCase())
          ) {
            eliminaciones++;
          }
        }

        // Si tiene 2 o más eliminaciones, excluir de la clasificación
        if (eliminaciones >= 2) {
          return null; // Será filtrado después
        }

        let total = 0;
        let resultadosValidos = 0;
        for (const p of ['sabado', 'domingo']) {
          const puntos = jinete[p]?.puntos;
          if (typeof puntos === 'number') {
            total += puntos;
            resultadosValidos++;
          } else if (
            typeof puntos === 'string' &&
            puntos !== '-' &&
            !isNaN(Number(puntos))
          ) {
            total += Number(puntos);
            resultadosValidos++;
          }
        }
        // Para categorías 080 y 100, usar el tiempo del domingo como desempate
        if (this.categoriaSeleccionada === '080' || this.categoriaSeleccionada === '100') {
          if (jinete.domingo && jinete.domingo.tiempo && jinete.domingo.tiempo !== '-') {
            jinete.desempate = {
              puntos: '-',
              tiempo: jinete.domingo.tiempo,
              caballo: jinete.domingo.caballo || '-',
              cl: '-'
            };
          }
        }

        return {
          ...jinete,
          total,
          resultadosValidos,
          eliminaciones, // Agregar el contador de eliminaciones
          resultados: ['sabado', 'domingo'].map(
            (p) => jinete[p]?.puntos
          ),
        } as any;
      })
      .filter((jinete) => jinete !== null); // Filtrar jinetes excluidos
    
    // Primero ordenar solo por puntos totales
    let ordenados = listadoJinetes.sort((a: any, b: any) => {
      return a.total - b.total;
    });

    // Ahora aplicar el desempate solo a los que están empatados en puntos totales
    const gruposEmpatados = this.agruparPorPuntosTotales(ordenados);
    const ordenFinal = this.aplicarDesempateAGrupos(gruposEmpatados);

    let clasificacionActual = 1;
    let posicionReal = 1;
    let totalAnterior: number | null = null;
    let puntosDesempateAnterior: number | null = null;
    let tiempoDesempateAnterior: number | null = null;

    // Aplicar clasificación al orden final (ya ordenado correctamente)
    const usarSoloTiempo = this.categoriaSeleccionada === '080' || this.categoriaSeleccionada === '100';
    ordenados = ordenFinal.map((jinete: any) => {
      const puntosDesempate = this.obtenerPuntosDesempate(jinete.desempate);
      // Para categorías 080 y 100, usar el tiempo del domingo directamente
      const tiempoDesempate = usarSoloTiempo
        ? this.convertirTiempoASegundos(jinete.domingo?.tiempo || '-')
        : this.convertirTiempoASegundos(jinete.desempate?.tiempo || '-');

      // Verificar si cambió el criterio de clasificación
      // Para categorías 080 y 100, solo considerar total y tiempo del domingo (no puntos de desempate)
      const cambioClasificacion =
        totalAnterior === null ||
        jinete.total !== totalAnterior ||
        (!usarSoloTiempo && puntosDesempate !== puntosDesempateAnterior) ||
        tiempoDesempate !== tiempoDesempateAnterior;

      if (cambioClasificacion) {
        clasificacionActual = posicionReal;
        totalAnterior = jinete.total;
        puntosDesempateAnterior = puntosDesempate;
        tiempoDesempateAnterior = tiempoDesempate;
      }

      posicionReal++;
      return {
        ...jinete,
        clasificacion: clasificacionActual,
        mostrarClasificacion: todosLosDiasCompletos, // Solo mostrar clasificación si todos los días están completos
      } as CompetitionData;
    });

    this.datos = ordenados;
  }

  private buscarJineteEnDatos(
    licencia: string,
    datosConcurso: any[],
    dia: string,
    jineteInfo?: { nombreJinete: string; caballo: string }
  ): any | null {
    const datosDia = datosConcurso.filter((d) => d.dia === dia);

    for (const prueba of datosDia) {
      for (const filaRaw of prueba.datos || []) {
        const fila = this.normalizeRow(filaRaw);

        // Obtener posibles identificadores
        const lic =
          fila['Licencia'] ||
          fila['LICENCIA'] ||
          fila['licencia'] ||
          fila['Lic'] ||
          fila['LIC'] ||
          fila['lic'] ||
          '';
        const nombreCaballo =
          fila['Caballo'] ||
          fila['CABALLO'] ||
          fila['caballo'] ||
          fila['Cab'] ||
          fila['CAB'] ||
          fila['cab'] ||
          '';
        const nombreJinete =
          fila['Atleta'] || fila['Jinete'] || fila['NOMBRE JINETE'] || '';

        // Normalizar valores para comparación
        const licNormalizada = (lic + '').toString().trim();
        const licenciaNormalizada = (licencia + '').toString().trim();
        const nombreCaballoNormalizado = (nombreCaballo + '')
          .toString()
          .trim()
          .toUpperCase();
        const nombreJineteNormalizado = (nombreJinete + '')
          .toString()
          .trim()
          .toUpperCase();

        // Si tenemos información del jinete de referencia, validar consistencia
        if (jineteInfo && jineteInfo.nombreJinete) {
          const nombreJineteReferencia = (jineteInfo.nombreJinete + '')
            .toString()
            .trim()
            .toUpperCase();
          const caballoReferencia = (jineteInfo.caballo + '')
            .toString()
            .trim()
            .toUpperCase();

          // Si el nombre del jinete no coincide, saltar
          if (
            nombreJineteNormalizado &&
            nombreJineteNormalizado !== nombreJineteReferencia
          ) {
            continue;
          }

          // Si el caballo no coincide, saltar
          if (
            caballoReferencia &&
            nombreCaballoNormalizado &&
            nombreCaballoNormalizado !== caballoReferencia
          ) {
            continue;
          }
        }

        // Verificar coincidencia por licencia exacta
        if (licNormalizada === licenciaNormalizada) {
          return { fila, prueba };
        }

        // Verificar coincidencia por nombre del caballo
        if (
          nombreCaballoNormalizado &&
          licenciaNormalizada.toUpperCase().includes(nombreCaballoNormalizado)
        ) {
          return { fila, prueba };
        }

        // Verificar coincidencia por licencia con sufijo (ej: licencia_1)
        if (licNormalizada.startsWith(licenciaNormalizada + '_')) {
          return { fila, prueba };
        }

        // Verificar si la licencia del equipo está contenida en la licencia del jinete
        // Solo si la licencia del jinete empieza con la licencia del equipo
        if (
          licNormalizada.startsWith(licenciaNormalizada) &&
          licenciaNormalizada.length > 3 &&
          licNormalizada !== licenciaNormalizada // No debe ser exactamente igual (ya se verificó arriba)
        ) {
          return { fila, prueba };
        }
      }
    }

    return null;
  }


  getTooltipText(competitionDay: CompetitionDay): string {
    if (
      !competitionDay ||
      competitionDay.puntos === '-' ||
      competitionDay.puntos === undefined
    ) {
      return 'Sin resultado';
    }
    return `Caballo: ${('' + competitionDay.caballo).toUpperCase()}\nTiempo: ${(
      '' + competitionDay.tiempo
    ).toUpperCase()}\nPuntos: ${(
      '' + competitionDay.puntos
    ).toUpperCase()}\nClasificación: ${('' + competitionDay.cl).toUpperCase()}`;
  }

  private convertirTiempoASegundos(tiempo: string): number {
    if (!tiempo || tiempo === '-') return 999999;

    const tiempoStr = tiempo.toString().trim();

    if (tiempoStr.includes(':')) {
      const partes = tiempoStr.split(':');
      if (partes.length === 2) {
        const minutos = parseInt(partes[0]) || 0;
        const segundos = parseFloat(partes[1]) || 0;
        return minutos * 60 + segundos;
      }
    }

    const segundos = parseFloat(tiempoStr);
    return isNaN(segundos) ? 999999 : segundos;
  }

  /**
   * Agrupa los jinetes por puntos totales
   */
  private agruparPorPuntosTotales(jinetes: any[]): any[][] {
    const grupos: any[][] = [];
    let grupoActual: any[] = [];
    let totalAnterior: number | null = null;

    for (const jinete of jinetes) {
      if (totalAnterior === null || jinete.total === totalAnterior) {
        grupoActual.push(jinete);
        totalAnterior = jinete.total;
      } else {
        if (grupoActual.length > 0) {
          grupos.push([...grupoActual]);
        }
        grupoActual = [jinete];
        totalAnterior = jinete.total;
      }
    }

    if (grupoActual.length > 0) {
      grupos.push(grupoActual);
    }

    return grupos;
  }

  /**
   * Aplica el desempate a los grupos de jinetes empatados
   */
  private aplicarDesempateAGrupos(grupos: any[][]): any[] {
    const resultado: any[] = [];

    for (const grupo of grupos) {
      if (grupo.length === 1) {
        // Solo un jinete, no hay empate
        resultado.push(...grupo);
      } else {
        // Hay empate, aplicar desempate
        const grupoOrdenado = this.ordenarGrupoConDesempate(grupo);
        resultado.push(...grupoOrdenado);
      }
    }

    return resultado;
  }

  /**
   * Ordena un grupo de jinetes empatados aplicando las reglas de desempate
   */
  private ordenarGrupoConDesempate(grupo: any[]): any[] {
    // Para categorías 080 y 100, solo usar el tiempo del domingo (sin puntos)
    const usarSoloTiempo = this.categoriaSeleccionada === '080' || this.categoriaSeleccionada === '100';

    return grupo.sort((a: any, b: any) => {
      if (usarSoloTiempo) {
        // Solo ordenar por tiempo del domingo directamente
        const tiempoDomingoA = this.convertirTiempoASegundos(
          a.domingo?.tiempo || '-'
        );
        const tiempoDomingoB = this.convertirTiempoASegundos(
          b.domingo?.tiempo || '-'
        );
        return tiempoDomingoA - tiempoDomingoB;
      }

      // Para otras categorías, usar la lógica normal (puntos primero, luego tiempo)
      // Primero por puntos del desempate (menor es mejor)
      const puntosDesempateA = this.obtenerPuntosDesempate(a.desempate);
      const puntosDesempateB = this.obtenerPuntosDesempate(b.desempate);

      if (puntosDesempateA !== puntosDesempateB) {
        return puntosDesempateA - puntosDesempateB;
      }

      // Si hay empate en puntos del desempate, ordenar por tiempo del desempate
      const tiempoDesempateA = this.convertirTiempoASegundos(
        a.desempate?.tiempo || '-'
      );
      const tiempoDesempateB = this.convertirTiempoASegundos(
        b.desempate?.tiempo || '-'
      );

      return tiempoDesempateA - tiempoDesempateB;
    });
  }

  /**
   * Obtiene los puntos del desempate para ordenamiento
   */
  private obtenerPuntosDesempate(desempate: CompetitionDay): number {
    // Para categorías 080 y 100, siempre devolver 0 ya que solo se usa el tiempo
    if (this.categoriaSeleccionada === '080' || this.categoriaSeleccionada === '100') {
      return 0;
    }

    if (
      !desempate ||
      desempate.puntos === undefined ||
      desempate.puntos === null ||
      desempate.puntos === '-'
    ) {
      return 999999; // Sin desempate va al final del grupo
    }

    // Verificar si es eliminación
    const esEliminacion =
      typeof desempate.puntos === 'string' &&
      ['EL', 'E', 'R', 'ELI', 'RET', 'NC'].includes(desempate.puntos.toUpperCase());

    if (esEliminacion) {
      return 999998; // Eliminados van al final del grupo
    }

    // Para el desempate, usar los puntos originales (no procesados)
    const puntos =
      typeof desempate.puntos === 'number'
        ? desempate.puntos
        : Number(desempate.puntos);

    return isNaN(puntos) ? 999999 : puntos;
  }

  /**
   * Formatea la visualización del domingo
   * Para categorías 080 y 100 muestra "puntos/tiempo", para otras solo puntos
   */
  formatearDomingo(domingo: CompetitionDay): string {
    const usarSoloTiempo = this.categoriaSeleccionada === '080' || this.categoriaSeleccionada === '100';
    
    if (!domingo || domingo.puntos === undefined || domingo.puntos === null || domingo.puntos === '-') {
      return '-';
    }

    // Verificar si es eliminación
    const esEliminacion =
      typeof domingo.puntos === 'string' &&
      ['EL', 'E', 'R', 'ELI', 'RET', 'NC'].includes(domingo.puntos.toUpperCase());

    if (esEliminacion) {
      // Si es NC, mostrar "NO CONTINUA", sino "Eliminado"
      if (typeof domingo.puntos === 'string' && domingo.puntos.toUpperCase() === 'NC') {
        return 'NO CONTINUA';
      }
      return 'Eliminado';
    }

    const puntos = domingo.puntos;
    const tiempo = domingo.tiempo || '-';

    // Para categorías 080 y 100, mostrar "puntos/tiempo"
    if (usarSoloTiempo) {
      return `${puntos}/${tiempo}`;
    }

    // Para otras categorías, solo mostrar puntos
    return `${puntos}`;
  }

  /**
   * Formatea la visualización del desempate (puntos/tiempo)
   */
  formatearDesempate(desempate: CompetitionDay): string {
    // Para categorías 080 y 100, mostrar solo el tiempo
    const usarSoloTiempo = this.categoriaSeleccionada === '080' || this.categoriaSeleccionada === '100';

    if (usarSoloTiempo) {
      const tiempo = desempate?.tiempo || '-';
      return tiempo;
    }

    // Verificar si es eliminación
    const esEliminacion =
      typeof desempate.puntos === 'string' &&
      ['EL', 'E', 'R', 'ELI', 'RET', 'NC'].includes(desempate.puntos.toUpperCase());

    if (esEliminacion) {
      // Si es NC, mostrar "NO CONTINUA", sino "Eliminado"
      if (typeof desempate.puntos === 'string' && desempate.puntos.toUpperCase() === 'NC') {
        return 'NO CONTINUA';
      }
      return 'Eliminado';
    }

    const puntos = desempate.puntos;
    const tiempo = desempate.tiempo || '-';

    return `${puntos}/${tiempo}`;
  }

  /**
   * Verifica si un jinete tiene desempate válido para mostrar estilos especiales
   */
  tieneDesempateValido(dato: CompetitionData): boolean {
    // Para categorías 080 y 100, solo verificar si tiene tiempo válido
    const usarSoloTiempo = this.categoriaSeleccionada === '080' || this.categoriaSeleccionada === '100';
    
    if (usarSoloTiempo) {
      return !!(dato.desempate && 
                dato.desempate.tiempo && 
                dato.desempate.tiempo !== '-');
    }

    // Verificar si tiene datos de desempate válidos
    if (
      !dato.desempate ||
      !dato.desempate.puntos ||
      dato.desempate.puntos === '-'
    ) {
      return false;
    }

    // Verificar si es eliminación (también cuenta como desempate válido)
    const esEliminacion =
      typeof dato.desempate.puntos === 'string' &&
      ['EL', 'E', 'R', 'ELI', 'RET', 'NC'].includes(
        dato.desempate.puntos.toUpperCase()
      );

    if (esEliminacion) {
      return true;
    }

    // Verificar si tiene puntos numéricos válidos
    const puntos =
      typeof dato.desempate.puntos === 'number'
        ? dato.desempate.puntos
        : Number(dato.desempate.puntos);

    return !isNaN(puntos);
  }

  /**
   * Procesa los puntos de un jinete eliminado en individuales, asignando el peor resultado de la categoría + 20
   */
  private procesarPuntosEliminadoIndividual(
    puntos: number | string,
    licencia: string,
    datosConcurso: any[],
    categoria: string,
    dia: string
  ): number {
    // Verificar si está eliminado
    const esEliminado =
      typeof puntos === 'string' &&
      ['EL', 'E', 'R', 'ELI', 'RET', 'NC'].includes(puntos.toString().toUpperCase());

    if (!esEliminado) {
      // No está eliminado, devolver puntos normales
      const puntosNormales =
        typeof puntos === 'number' ? puntos : Number(puntos) || 0;
      return puntosNormales;
    }

    // Buscar el peor resultado (más puntos) en la categoría del día específico
    const datosDia = datosConcurso.filter(
      (d) => d.dia === dia && d.categoria === categoria
    );

    let peorPuntos = 0;
    let totalResultados = 0;

    for (const pruebaDia of datosDia) {
      for (const filaRaw of pruebaDia.datos || []) {
        const fila = this.normalizeRow(filaRaw);
        const puntosFila = fila['Faltas'] ?? fila['Puntos'];

        // Solo considerar resultados numéricos válidos (no eliminaciones)
        const esEliminacion =
          puntosFila &&
          ['EL', 'E', 'R', 'ELI', 'RET', 'NC'].includes(
            ('' + puntosFila).toUpperCase()
          );

        if (!esEliminacion) {
          const puntosNum =
            typeof puntosFila === 'number'
              ? puntosFila
              : typeof puntosFila === 'string' && !isNaN(Number(puntosFila))
              ? Number(puntosFila)
              : 0;

          totalResultados++;

          if (puntosNum > peorPuntos) {
            peorPuntos = puntosNum;
          }
        }
      }
    }

    const puntosFinales = peorPuntos + 20;
    return puntosFinales;
  }

  /**
   * Procesa los puntos de un jinete eliminado, asignando el peor resultado de la categoría + 20
   */
  private procesarPuntosEliminado(
    puntosSabado: number | string,
    licencia: string,
    datosConcurso: any[],
    categoria: string
  ): number {
    // Verificar si está eliminado en sábado
    const esEliminadoSabado =
      typeof puntosSabado === 'string' &&
      ['EL', 'E', 'R', 'ELI', 'RET', 'NC'].includes(
        puntosSabado.toString().toUpperCase()
      );

    if (!esEliminadoSabado) {
      // No está eliminado, devolver puntos normales
      const puntosNormales =
        typeof puntosSabado === 'number'
          ? puntosSabado
          : Number(puntosSabado) || 0;
      return puntosNormales;
    }

    // Buscar el peor resultado (más puntos) en la categoría del sábado
    const datosSabado = datosConcurso.filter(
      (d) => d.dia === 'SABADO' && d.categoria === categoria
    );

    let peorPuntos = 0;
    let totalResultados = 0;

    for (const pruebaSabado of datosSabado) {
      for (const filaRaw of pruebaSabado.datos || []) {
        const fila = this.normalizeRow(filaRaw);
        const puntos = fila['Faltas'] ?? fila['Puntos'];

        // Solo considerar resultados numéricos válidos (no eliminaciones)
        const esEliminacion =
          puntos &&
          ['EL', 'E', 'R', 'ELI', 'RET', 'NC'].includes(('' + puntos).toUpperCase());

        if (!esEliminacion) {
          const puntosNum =
            typeof puntos === 'number'
              ? puntos
              : typeof puntos === 'string' && !isNaN(Number(puntos))
              ? Number(puntos)
              : 0;

          totalResultados++;

          if (puntosNum > peorPuntos) {
            peorPuntos = puntosNum;
          }
        }
      }
    }

    const puntosFinales = peorPuntos + 20;
    return puntosFinales;
  }

  /**
   * Obtiene el grupo de categorías al que pertenece una categoría
   */
  private obtenerGrupoCategoria(categoria: string): string | null {
    // Normalizar la categoría para comparación
    const categoriaNormalizada = categoria.trim().toUpperCase();

    for (const [grupo, categorias] of Object.entries(this.gruposCategorias)) {
      for (const cat of categorias as string[]) {
        const catNormalizada = cat.trim().toUpperCase();
        if (categoriaNormalizada === catNormalizada) {
          return grupo;
        }
      }
    }

    return null;
  }

  /**
   * Verifica si dos categorías son compatibles (mismo grupo)
   */
  private sonCategoriasCompatibles(cat1: string, cat2: string): boolean {
    const grupo1 = this.obtenerGrupoCategoria(cat1);
    const grupo2 = this.obtenerGrupoCategoria(cat2);
    return grupo1 !== null && grupo1 === grupo2;
  }


  // Métodos de descarga Excel
  descargarExcelIndividual() {
    if (this.datos.length === 0) {
      alert('No hay datos para descargar');
      return;
    }

    const usarSoloTiempo = this.categoriaSeleccionada === '080' || this.categoriaSeleccionada === '100';
    const datosExcel = this.datos.map((dato, index) => {
      const baseData: any = {
        Clasificación: dato.mostrarClasificacion ? dato.clasificacion : '',
        Jinete: dato.nombreJinete,
        Caballo: dato.caballo,
        Club: dato.club,
        Total: dato.total,
        'Sábado Puntos': dato.sabado.puntos,
        'Sábado Tiempo': dato.sabado.tiempo,
        'Sábado Caballo': dato.sabado.caballo,
        'Domingo': usarSoloTiempo ? this.formatearDomingo(dato.domingo) : dato.domingo.puntos,
        'Domingo Tiempo': dato.domingo.tiempo,
        'Domingo Caballo': dato.domingo.caballo,
      };
      
      if (!usarSoloTiempo) {
        baseData['Desempate Puntos'] = dato.desempate.puntos;
        baseData['Desempate Tiempo'] = dato.desempate.tiempo;
        baseData['Desempate Caballo'] = dato.desempate.caballo;
        baseData['Desempate Formateado'] = this.formatearDesempate(dato.desempate);
      }
      
      return baseData;
    });

    const ws = XLSX.utils.json_to_sheet(datosExcel);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Clasificación');

    const nombreArchivo = `Clasificacion_${this.categoriaSeleccionada}_${
      new Date().toISOString().split('T')[0]
    }.xlsx`;
    XLSX.writeFile(wb, nombreArchivo);
  }


  imprimirIndividual() {
    const ventanaImpresion = window.open('', '_blank');
    if (!ventanaImpresion) return;

    const htmlImpresion = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Clasificación ${this.categoriaSeleccionada}</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            margin: 20px;
            background: white;
            color: black;
          }
          .header {
            text-align: center;
            margin-bottom: 30px;
            border-bottom: 2px solid #333;
            padding-bottom: 20px;
          }
          .header h1 {
            color: #2c3e50;
            margin: 0 0 10px 0;
            font-size: 28px;
          }
          .header h2 {
            color: #34495e;
            margin: 0 0 10px 0;
            font-size: 22px;
          }
          .header p {
            color: #7f8c8d;
            margin: 0;
            font-size: 14px;
          }
          .competition-table {
            width: 100%;
            border-collapse: collapse;
            margin: 20px 0;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          }
          .competition-table th {
            background: #34495e;
            color: white;
            padding: 12px 8px;
            text-align: center;
            font-weight: bold;
            border: 1px solid #2c3e50;
          }
          .competition-table td {
            padding: 10px 8px;
            text-align: center;
            border: 1px solid #bdc3c7;
            vertical-align: middle;
          }
          .competition-table tr:nth-child(even) {
            background-color: #f8f9fa;
          }
          .competition-table tr:hover {
            background-color: #e8f4f8;
          }
          .total-column {
            font-weight: bold;
            background-color: #ecf0f1 !important;
          }
          .top-1 { background-color: #ffd700 !important; }
          .top-2 { background-color: #c0c0c0 !important; }
          .top-3 { background-color: #cd7f32 !important; }
          .tachado {
            text-decoration: line-through;
            color: #7f8c8d;
            background-color: #f5f5f5 !important;
          }
          @media print {
            body { margin: 0; }
            .header { page-break-after: avoid; }
            .competition-table { page-break-inside: avoid; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Campeonato de Bizkaia de Salto 2025</h1>
          <h2>Clasificación ${this.categoriaSeleccionada}</h2>
          <p>Fecha: ${new Date().toLocaleDateString('es-ES')}</p>
        </div>
        <table class="competition-table">
          <thead>
            <tr>
              ${this.datos[0]?.mostrarClasificacion ? '<th>Clas.</th>' : ''}
              <th>Jinete</th>
              <th>Caballo</th>
              <th>Club</th>
              <th class="total-column">Total</th>
              <th>Sábado</th>
              <th>Domingo</th>
              ${(this.categoriaSeleccionada !== '080' && this.categoriaSeleccionada !== '100') ? '<th>Desempate</th>' : ''}
            </tr>
          </thead>
          <tbody>
            ${this.datos
              .map(
                (dato, i) => `
              <tr class="${this.getRowClass(i, dato)}">
                ${
                  dato.mostrarClasificacion
                    ? `<td>${dato.clasificacion}</td>`
                    : ''
                }
                <td>
                  ${this.getMedalIcon(i, dato)}
                  ${dato.nombreJinete.toUpperCase()}
                </td>
                <td>${dato.caballo.toUpperCase()}</td>
                <td>${dato.club ? dato.club.toUpperCase() : '-'}</td>
                <td class="total-column">${dato.total}</td>
                <td>
                  ${
                    dato.sabado?.puntos !== undefined &&
                    dato.sabado?.puntos !== null
                      ? dato.sabado.puntos
                      : '-'
                  }
                </td>
                <td>
                  ${this.formatearDomingo(dato.domingo)}
                </td>
                ${(this.categoriaSeleccionada !== '080' && this.categoriaSeleccionada !== '100') ? `<td>
                  ${this.formatearDesempate(dato.desempate)}
                </td>` : ''}
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>
      </body>
      </html>
    `;

    ventanaImpresion.document.write(htmlImpresion);
    ventanaImpresion.document.close();

    // Esperar a que se cargue el contenido y luego imprimir
    ventanaImpresion.onload = () => {
      ventanaImpresion.focus();
      ventanaImpresion.print();
    };
  }

  private getRowClass(i: number, dato: any): string {
    const classes = [];
    if (i === 0 && dato.mostrarClasificacion) classes.push('top-1');
    else if (i === 1 && dato.mostrarClasificacion) classes.push('top-2');
    else if (i === 2 && dato.mostrarClasificacion) classes.push('top-3');
    else if (i === 3 && dato.mostrarClasificacion) classes.push('top-4');
    else if (i === 4 && dato.mostrarClasificacion) classes.push('top-5');
    else if (i === 5 && dato.mostrarClasificacion) classes.push('top-6');
    else if (i === 6 && dato.mostrarClasificacion) classes.push('top-7');
    else if (i === 7 && dato.mostrarClasificacion) classes.push('top-8');
    else if (i === 8 && dato.mostrarClasificacion) classes.push('top-9');
    else if (i === 9 && dato.mostrarClasificacion) classes.push('top-10');
    return classes.join(' ');
  }

  private getMedalIcon(i: number, dato: any): string {
    if (!dato.mostrarClasificacion) return '';

    if (
      this.categoriaSeleccionada === '130' ||
      this.categoriaSeleccionada === '120'
    ) {
      if (i === 0) return '🥇 ';
      if (i === 1) return '🥈 ';
      if (i === 2) return '🥉 ';
      if (i === 3) return '🏅 ';
      if (i === 4) return '🏅 ';
    } else {
      if (i === 0) return '🥇 ';
      if (i === 1) return '🥈 ';
      if (i === 2) return '🥉 ';
    }
    return '';
  }
}
