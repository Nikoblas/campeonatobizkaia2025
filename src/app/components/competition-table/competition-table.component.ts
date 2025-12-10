import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import {
  CompetitionService,
  EquipoEntry,
} from '../../services/competition.service';
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
  total: number;
  viernes: CompetitionDay;
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
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './competition-table.component.html',
  styleUrls: ['./competition-table.component.scss'],
})
export class CompetitionTableComponent implements OnInit, OnDestroy {
  categorias: string[] = [];
  categoriaSeleccionada: string = 'inicio';
  datos: CompetitionData[] = [];
  cargando: boolean = false;
  private subscriptions: Subscription[] = [];

  // Estado para categoría EQUIPOS
  equipos: Array<{
    equipo: string;
    jefeEquipo: string;
    miembros: Array<{
      licencia: string;
      nombreJinete: string;
      categoria: string;
      caballo: string;
      puntos: number | string;
      tiempo: string;
      validoParaTotal?: boolean;
      tachado?: boolean;
    }>;
    totalPuntos: number | string;
    totalTiempoSegundos: number;
    eliminado?: boolean;
  }> = [];

  // Grupos de categorías compatibles
  private gruposCategorias = {
    grupo1: ['Adultos', 'Juveniles1'],
    grupo2: ['Juveniles', 'Veteranos1'],
    grupo3: ['Alevines', 'Infantiles', 'Veteranos'],
  };

  constructor(
    private competitionService: CompetitionService,
    private http: HttpClient
  ) {}

  ngOnInit() {
    this.categorias = this.competitionService.getCategorias();

    const categoriaGuardada = localStorage.getItem('categoriaSeleccionada');
    if (categoriaGuardada && categoriaGuardada !== 'inicio') {
      this.categoriaSeleccionada = categoriaGuardada;
      localStorage.removeItem('categoriaSeleccionada');
    }

    const datosSub = this.competitionService.datosListos$.subscribe((ready) => {
      if (ready) {
        this.cargarDatos();
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
      this.cargarDatos();
    }
  }

  seleccionarCategoria(categoria: string) {
    this.categoriaSeleccionada = categoria;
    this.cargarDatos();
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
      alert(
        'Error al descargar el PDF. Por favor, inténtalo de nuevo más tarde.'
      );
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
    if (this.categoriaSeleccionada === 'EQUIPOS') {
      this.cargarEquiposDesdeExcel();
      return;
    }
    const concurso = 'SEDE';
    const datosConcurso =
      this.competitionService.getAllCompetitionData(concurso);
    const pruebas = [
      { key: 'viernes', dia: 'VIERNES' },
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
        ['VIERNES', 'SABADO', 'DOMINGO'].includes(d.dia) &&
        d.datos &&
        d.datos.length > 0
    ).length;
    const todosLosDiasCompletos = diasConDatos === 3;

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
        for (const p of ['viernes', 'sabado', 'domingo', 'desempate']) {
          if (!jinete[p]) {
            jinete[p] = { puntos: '-', tiempo: '-', caballo: '-', cl: '-' };
          }
        }

        // Verificar que el jinete corrió tanto viernes como sábado
        // Un jinete ha corrido si tiene datos (incluso con 0 puntos)
        const corrioViernes = jinete.viernes && jinete.viernes.puntos !== '-';
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

        // Si no corrió viernes, sábado o domingo (si existe), excluir de la clasificación
        if (!corrioViernes || !corrioSabado || !corrioDomingo) {
          return null; // Será filtrado después
        }

        // Contar eliminaciones (E, EL, ELI, RET, NC) usando puntos originales
        let eliminaciones = 0;
        for (const p of ['viernes', 'sabado', 'domingo']) {
          const puntosOriginales = jinete[p]?.puntosOriginal;
          if (
            typeof puntosOriginales === 'string' &&
            ['EL', 'E', 'R', 'ELI', 'RET', 'NC'].includes(puntosOriginales.toUpperCase())
          ) {
            eliminaciones++;
            console.log(
              `⚠️ ELIMINACIÓN: ${
                jinete.nombreJinete
              } - ${p.toUpperCase()}: ${puntosOriginales} (Total: ${eliminaciones})`
            );
          }
        }

        // Si tiene 2 o más eliminaciones, excluir de la clasificación
        if (eliminaciones >= 2) {
          console.log(
            `❌ EXCLUIDO: ${jinete.nombreJinete} - ${eliminaciones} eliminaciones (E, EL, ELI, RET, NC)`
          );
          return null; // Será filtrado después
        }

        let total = 0;
        let resultadosValidos = 0;
        for (const p of ['viernes', 'sabado', 'domingo']) {
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
        return {
          ...jinete,
          total,
          resultadosValidos,
          eliminaciones, // Agregar el contador de eliminaciones
          resultados: ['viernes', 'sabado', 'domingo'].map(
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
    ordenados = ordenFinal.map((jinete: any) => {
      const puntosDesempate = this.obtenerPuntosDesempate(jinete.desempate);
      const tiempoDesempate = this.convertirTiempoASegundos(
        jinete.desempate?.tiempo || '-'
      );

      // Verificar si cambió el criterio de clasificación
      const cambioClasificacion =
        totalAnterior === null ||
        jinete.total !== totalAnterior ||
        puntosDesempate !== puntosDesempateAnterior ||
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
    console.log(
      `[BÚSQUEDA] Buscando licencia: "${licencia}" en ${dia} (${datosDia.length} archivos)`
    );

    for (const prueba of datosDia) {
      console.log(
        `[BÚSQUEDA] Revisando archivo: ${prueba.categoria} con ${
          prueba.datos?.length || 0
        } filas`
      );
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

        console.log(
          `[BÚSQUEDA] Comparando: "${licNormalizada}" vs "${licenciaNormalizada}" (${
            licNormalizada === licenciaNormalizada ? 'COINCIDE' : 'NO COINCIDE'
          })`
        );

        // Si tenemos información del jinete de viernes, validar consistencia
        if (jineteInfo && jineteInfo.nombreJinete) {
          const nombreJineteViernes = (jineteInfo.nombreJinete + '')
            .toString()
            .trim()
            .toUpperCase();
          const caballoViernes = (jineteInfo.caballo + '')
            .toString()
            .trim()
            .toUpperCase();

          // Si el nombre del jinete no coincide, saltar
          if (
            nombreJineteNormalizado &&
            nombreJineteNormalizado !== nombreJineteViernes
          ) {
            continue;
          }

          // Si el caballo no coincide, saltar
          if (
            caballoViernes &&
            nombreCaballoNormalizado &&
            nombreCaballoNormalizado !== caballoViernes
          ) {
            continue;
          }
        }

        // Verificar coincidencia por licencia exacta
        if (licNormalizada === licenciaNormalizada) {
          console.log(
            `[BÚSQUEDA] ✅ ENCONTRADO por licencia exacta: ${nombreJinete} (${nombreCaballo})`
          );
          return { fila, prueba };
        }

        // Verificar coincidencia por nombre del caballo
        if (
          nombreCaballoNormalizado &&
          licenciaNormalizada.toUpperCase().includes(nombreCaballoNormalizado)
        ) {
          console.log(
            `[BÚSQUEDA] ✅ ENCONTRADO por nombre caballo: ${nombreJinete} (${nombreCaballo})`
          );
          return { fila, prueba };
        }

        // Verificar coincidencia por licencia con sufijo (ej: licencia_1)
        if (licNormalizada.startsWith(licenciaNormalizada + '_')) {
          console.log(
            `[BÚSQUEDA] ✅ ENCONTRADO por sufijo: ${nombreJinete} (${nombreCaballo})`
          );
          return { fila, prueba };
        }

        // Verificar si la licencia del equipo está contenida en la licencia del jinete
        // Solo si la licencia del jinete empieza con la licencia del equipo
        if (
          licNormalizada.startsWith(licenciaNormalizada) &&
          licenciaNormalizada.length > 3 &&
          licNormalizada !== licenciaNormalizada // No debe ser exactamente igual (ya se verificó arriba)
        ) {
          console.log(
            `[BÚSQUEDA] ✅ ENCONTRADO por prefijo: ${nombreJinete} (${nombreCaballo})`
          );
          return { fila, prueba };
        }
      }
    }

    console.log(
      `[BÚSQUEDA] ❌ NO ENCONTRADO: Licencia "${licencia}" no se encontró en ${dia}`
    );
    return null;
  }

  private cargarEquiposDesdeExcel() {
    this.equipos = [];
    const concurso = 'SEDE';
    const datosConcurso =
      this.competitionService.getAllCompetitionData(concurso);
    this.competitionService.loadEquipos().subscribe({
      next: (entries) => {
        const equipoToLicencias: {
          [nombre: string]: {
            licencias: { licencia: string }[];
            jefeEquipo: string;
          };
        } = {};
        for (const e of entries) {
          if (!equipoToLicencias[e.equipo]) {
            equipoToLicencias[e.equipo] = {
              licencias: [],
              jefeEquipo: e.jefeEquipo,
            };
          }
          equipoToLicencias[e.equipo].licencias.push({
            licencia: e.licencia,
          });
        }

        const equiposResultado: any[] = [];
        for (const equipoNombre of Object.keys(equipoToLicencias)) {
          const equipoData = equipoToLicencias[equipoNombre];
          const licencias = equipoData.licencias;
          const jefeEquipo = equipoData.jefeEquipo;
          const miembros: any[] = [];

          // Obtener datos del viernes para nombres y categorías
          const datosViernes = datosConcurso.filter((d) => d.dia === 'VIERNES');
          const datosSabado = datosConcurso.filter((d) => d.dia === 'SABADO');

          for (const licenciaData of licencias) {
            const licencia = licenciaData.licencia;

            let nombreJinete: string = '';
            let categoria: string = '';
            let caballo: string = '';
            let puntos: number | string = '-';
            let tiempo: string = '0';

            // Buscar en viernes para obtener nombre, categoría y caballo
            const resultadoViernes = this.buscarJineteEnDatos(
              licencia,
              datosConcurso,
              'VIERNES'
            );
            if (resultadoViernes) {
              const { fila, prueba } = resultadoViernes;
              nombreJinete =
                fila['Atleta'] || fila['Jinete'] || fila['NOMBRE JINETE'] || '';
              categoria = prueba.categoria;
              caballo =
                fila['Caballo'] ||
                fila['CABALLO'] ||
                fila['caballo'] ||
                fila['Cab'] ||
                fila['CAB'] ||
                fila['cab'] ||
                '';
            } else {
              // No se encontró jinete en viernes
              console.log(
                `❌ NO ENCONTRADO: Licencia: ${licencia} - No se encontró jinete para VIERNES`
              );
            }

            // Buscar en sábado usando la búsqueda normal por licencia del jinete
            const jineteInfo = { nombreJinete, caballo };
            const resultadoSabado = this.buscarJineteEnDatos(
              licencia,
              datosConcurso,
              'SABADO',
              jineteInfo
            );

            if (resultadoSabado) {
              const { fila } = resultadoSabado;
              const puntosOriginal = fila['Faltas'] ?? fila['Puntos'];
              const esEliminacion =
                puntosOriginal &&
                ['EL', 'E', 'R', 'ELI', 'RET', 'NC'].includes(
                  ('' + puntosOriginal).toUpperCase()
                );

              if (esEliminacion) {
                // Para eliminaciones, usar 0 puntos (empate)
                (puntos = 'E'), 'R';
              } else {
                // Para puntos normales
                const puntosNum =
                  typeof puntosOriginal === 'number'
                    ? puntosOriginal
                    : typeof puntosOriginal === 'string' &&
                      !isNaN(Number(puntosOriginal))
                    ? Number(puntosOriginal)
                    : puntosOriginal;
                puntos = puntosNum ?? 0; // Si no hay resultado, usar 0
              }

              tiempo = fila['Tiempo'] ?? fila['TIempo'] ?? '0'; // Si no hay tiempo, usar 0
            } else {
              // No se encontró resultado para sábado
              console.log(
                `❌ NO ENCONTRADO: ${nombreJinete} (${categoria}) - Licencia: ${licencia} - Caballo: ${caballo} - No se encontró resultado para SÁBADO`
              );
            }

            // Para equipos, incluir todos los miembros que tengan datos básicos
            if (nombreJinete && categoria) {
              // Guardar los puntos originales (sin procesar eliminados)
              miembros.push({
                licencia,
                nombreJinete,
                categoria,
                caballo,
                puntos: puntos, // Puntos originales
                tiempo,
              });
              console.log(
                `✅ Miembro agregado: ${nombreJinete} (${categoria}) - Puntos: ${puntos}`
              );
            } else {
              console.log(
                `❌ Miembro NO agregado: licencia=${licencia}, nombreJinete="${nombreJinete}", categoria="${categoria}" - Faltan datos básicos`
              );
            }
          }

          console.log(
            `Equipo ${equipoNombre}: Total miembros encontrados = ${miembros.length}`
          );

          // Aplicar las nuevas reglas de procesamiento de miembros
          this.procesarMiembrosEquipo(miembros);

          // Procesar puntos eliminados SOLO para los miembros seleccionados
          miembros.forEach((miembro) => {
            if (miembro.validoParaTotal) {
              const puntosOriginales = miembro.puntos;
              const puntosFinales = this.procesarPuntosEliminado(
                puntosOriginales,
                miembro.licencia,
                datosConcurso,
                miembro.categoria
              );
              miembro.puntos = puntosFinales;
            }
          });

          // Verificar si el equipo está eliminado (algún miembro válido seleccionado tiene resultado 'E','R')
          const equipoEliminado =
            this.verificarEliminacionEquipoSeleccionados(miembros);

          // Calcular totales solo con los miembros válidos
          let totalPuntos: number | string = 0;
          let totalTiempoSegundos = 0;

          if (equipoEliminado) {
            // Equipo eliminado: usar "ELI" como puntos y no calcular tiempo
            totalPuntos = 'ELI';
            totalTiempoSegundos = 0;
          } else {
            // Equipo normal: calcular puntos y tiempo normalmente
            for (const r of miembros) {
              if (r.validoParaTotal) {
                const p =
                  typeof r.puntos === 'number' ? r.puntos : Number(r.puntos);
                if (!isNaN(p)) totalPuntos += p;
                const seg = this.convertirTiempoASegundos(r.tiempo);
                if (!isNaN(seg)) totalTiempoSegundos += seg;
              }
            }
          }

          equiposResultado.push({
            equipo: equipoNombre,
            jefeEquipo: jefeEquipo,
            miembros,
            totalPuntos,
            totalTiempoSegundos,
            eliminado: equipoEliminado,
          });
        }

        equiposResultado.sort((a, b) => {
          // Los equipos eliminados van al final
          if (a.eliminado && !b.eliminado) return 1;
          if (!a.eliminado && b.eliminado) return -1;
          if (a.eliminado && b.eliminado) return 0; // Ambos eliminados, mantener orden original

          // Para equipos no eliminados, ordenar por puntos totales (menor es mejor)
          if (a.totalPuntos !== b.totalPuntos) {
            return a.totalPuntos - b.totalPuntos;
          }
          // En caso de empate, ordenar por tiempo total (menor es mejor)
          return a.totalTiempoSegundos - b.totalTiempoSegundos;
        });

        this.equipos = equiposResultado;
      },
      error: (err) => {
        console.error('Error cargando equipos:', err);
        this.equipos = [];
      },
    });
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
    return grupo.sort((a: any, b: any) => {
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
   * Formatea la visualización del desempate (puntos/tiempo)
   */
  formatearDesempate(desempate: CompetitionDay): string {
    console.log('Formateando desempate:', desempate);

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
      for (const cat of categorias) {
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

  /**
   * Procesa los miembros de un equipo aplicando las reglas de categorías
   */
  private procesarMiembrosEquipo(miembros: any[]): any[] {
    // Inicializar todos los miembros
    miembros.forEach((miembro, index) => {
      miembro.validoParaTotal = false;
      miembro.tachado = true;
    });

    if (miembros.length <= 3) {
      // Si hay 3 o menos miembros, todos son válidos y no se tacha ninguno
      miembros.forEach((miembro, index) => {
        miembro.validoParaTotal = true;
        miembro.tachado = false;
      });
      return miembros;
    }

    // Aplicar reglas de tachado para más de 3 miembros

    // Crear mapa de grupos y sus miembros
    const gruposMap = new Map<string, any[]>();
    miembros.forEach((miembro) => {
      const grupo = this.obtenerGrupoCategoria(miembro.categoria);

      if (grupo) {
        if (!gruposMap.has(grupo)) {
          gruposMap.set(grupo, []);
        }
        gruposMap.get(grupo)!.push(miembro);
      } else {
        // Si no pertenece a ningún grupo, crear un grupo individual
        const grupoIndividual = `individual_${miembro.categoria}`;
        if (!gruposMap.has(grupoIndividual)) {
          gruposMap.set(grupoIndividual, []);
        }
        gruposMap.get(grupoIndividual)!.push(miembro);
      }
    });

    // Encontrar grupos con más de un miembro
    const gruposConMultiplesMiembros = Array.from(gruposMap.entries()).filter(
      ([_, miembrosGrupo]) => miembrosGrupo.length > 1
    );

    if (gruposConMultiplesMiembros.length > 0) {
      // Hay grupos con múltiples miembros, procesarlos
      this.procesarGruposConMultiplesMiembros(
        miembros,
        gruposConMultiplesMiembros
      );
    } else {
      // No hay grupos con múltiples miembros, seleccionar los 3 mejores
      this.seleccionarMejoresTres(miembros);
    }

    return miembros;
  }

  /**
   * Verifica si un valor indica eliminación
   */
  private esEliminado(valor: any): boolean {
    return (
      typeof valor === 'string' &&
      ['E', 'R', 'EL', 'ELI', 'RET'].includes(valor.toUpperCase())
    );
  }

  /**
   * Verifica si un equipo está eliminado (algún miembro válido seleccionado tiene resultado 'E','R' en puntos o tiempo)
   */
  private verificarEliminacionEquipoSeleccionados(miembros: any[]): boolean {
    return miembros.some((miembro) => {
      if (!miembro.validoParaTotal) return false;

      const puntos = miembro.puntos;
      const tiempo = miembro.tiempo;

      // PRIORIDAD: Verificar primero el tiempo, luego los puntos
      const eliminadoEnTiempo = this.esEliminado(tiempo);
      const eliminadoEnPuntos = this.esEliminado(puntos);

      return eliminadoEnTiempo || eliminadoEnPuntos;
    });
  }

  /**
   * Verifica si un equipo está eliminado (algún miembro válido tiene resultado 'E','R' en puntos o tiempo)
   * @deprecated Usar verificarEliminacionEquipoSeleccionados en su lugar
   */
  private verificarEliminacionEquipo(miembros: any[]): boolean {
    return this.verificarEliminacionEquipoSeleccionados(miembros);
  }

  /**
   * Verifica si hay grupos compatibles en los miembros
   */
  private verificarGruposCompatibles(miembros: any[]): any[] {
    const gruposMap = new Map<string, any[]>();

    miembros.forEach((miembro) => {
      const grupo = this.obtenerGrupoCategoria(miembro.categoria);
      if (grupo) {
        if (!gruposMap.has(grupo)) {
          gruposMap.set(grupo, []);
        }
        gruposMap.get(grupo)!.push(miembro);
      }
    });

    // Retornar grupos que tienen más de un miembro
    return Array.from(gruposMap.entries()).filter(
      ([_, miembros]) => miembros.length > 1
    );
  }

  /**
   * Selecciona los 3 mejores miembros cuando no hay duplicados ni grupos compatibles
   */
  private seleccionarMejoresTres(miembros: any[]): void {
    // Marcar todos como no válidos inicialmente
    miembros.forEach((miembro) => {
      miembro.validoParaTotal = false;
      miembro.tachado = true;
    });

    // Ordenar por puntos (menor es mejor) y luego por tiempo (menor es mejor)
    const miembrosOrdenados = [...miembros].sort((a, b) => {
      const puntosA =
        typeof a.puntos === 'number' ? a.puntos : Number(a.puntos);
      const puntosB =
        typeof b.puntos === 'number' ? b.puntos : Number(b.puntos);

      if (puntosA !== puntosB) {
        return puntosA - puntosB;
      }

      const tiempoA = this.convertirTiempoASegundos(a.tiempo);
      const tiempoB = this.convertirTiempoASegundos(b.tiempo);
      return tiempoA - tiempoB;
    });

    // Seleccionar los 3 mejores
    const seleccionados = miembrosOrdenados.slice(0, 3);
    seleccionados.forEach((miembro) => {
      miembro.validoParaTotal = true;
      miembro.tachado = false;
    });
  }

  /**
   * Procesa grupos con múltiples miembros (unifica categorías duplicadas y grupos compatibles)
   */
  private procesarGruposConMultiplesMiembros(
    miembros: any[],
    gruposConMultiplesMiembros: [string, any[]][]
  ): void {
    // Marcar todos como no válidos inicialmente
    miembros.forEach((miembro) => {
      miembro.validoParaTotal = false;
      miembro.tachado = true;
    });

    // Para cada grupo con múltiples miembros, seleccionar el mejor resultado
    const miembrosSeleccionados: any[] = [];

    for (const [grupo, miembrosGrupo] of gruposConMultiplesMiembros) {
      // Ordenar TODOS los miembros: válidos primero, eliminados después
      miembrosGrupo.sort((a, b) => {
        // Primero verificar si alguno está eliminado
        const aEliminado =
          this.esEliminado(a.tiempo) || this.esEliminado(a.puntos);
        const bEliminado =
          this.esEliminado(b.tiempo) || this.esEliminado(b.puntos);

        // Si uno está eliminado y el otro no, el no eliminado va primero
        if (aEliminado && !bEliminado) return 1;
        if (!aEliminado && bEliminado) return -1;

        // Si ambos están eliminados o ambos son válidos, ordenar por puntos y tiempo
        const puntosA =
          typeof a.puntos === 'number' ? a.puntos : Number(a.puntos);
        const puntosB =
          typeof b.puntos === 'number' ? b.puntos : Number(b.puntos);

        if (puntosA !== puntosB) {
          return puntosA - puntosB;
        }

        const tiempoA = this.convertirTiempoASegundos(a.tiempo);
        const tiempoB = this.convertirTiempoASegundos(b.tiempo);
        return tiempoA - tiempoB;
      });

      // Seleccionar el primero (mejor) de la lista ordenada
      const mejor = miembrosGrupo[0];
      const esEliminado =
        this.esEliminado(mejor.tiempo) || this.esEliminado(mejor.puntos);

      // Marcar el seleccionado como válido
      mejor.validoParaTotal = true;
      mejor.tachado = false;
      miembrosSeleccionados.push(mejor);

      // Tachar todos los demás de este grupo
      for (const miembro of miembrosGrupo) {
        if (miembro !== mejor) {
          miembro.validoParaTotal = false;
          miembro.tachado = true;
        }
      }
    }

    // Agregar miembros de grupos únicos (con un solo miembro)
    miembros.forEach((miembro) => {
      if (!miembro.tachado) return; // Ya procesado

      const grupo = this.obtenerGrupoCategoria(miembro.categoria);
      const grupoKey = grupo || `individual_${miembro.categoria}`;

      // Verificar si este grupo ya fue procesado (tenía múltiples miembros)
      const esGrupoProcesado = gruposConMultiplesMiembros.some(
        ([grupoNombre, _]) => grupoNombre === grupoKey
      );

      if (!esGrupoProcesado) {
        miembro.validoParaTotal = true;
        miembro.tachado = false;
        miembrosSeleccionados.push(miembro);
      }
    });

    // Si tenemos menos de 3 miembros válidos, agregar los mejores de los tachados
    if (miembrosSeleccionados.length < 3) {
      const miembrosTachados = miembros.filter((m) => m.tachado);
      miembrosTachados.sort((a, b) => {
        const puntosA =
          typeof a.puntos === 'number' ? a.puntos : Number(a.puntos);
        const puntosB =
          typeof b.puntos === 'number' ? b.puntos : Number(b.puntos);

        if (puntosA !== puntosB) {
          return puntosA - puntosB;
        }

        const tiempoA = this.convertirTiempoASegundos(a.tiempo);
        const tiempoB = this.convertirTiempoASegundos(b.tiempo);
        return tiempoA - tiempoB;
      });

      const necesarios = Math.min(
        3 - miembrosSeleccionados.length,
        miembrosTachados.length
      );

      for (let i = 0; i < necesarios; i++) {
        miembrosTachados[i].validoParaTotal = true;
        miembrosTachados[i].tachado = false;
      }
    }
  }

  /**
   * Procesa equipos con categorías duplicadas (DEPRECATED - usar procesarGruposConMultiplesMiembros)
   */
  private procesarCategoriasDuplicadas(
    miembros: any[],
    categoriasDuplicadas: [string, any[]][]
  ): void {
    // Marcar todos como no válidos inicialmente
    miembros.forEach((miembro) => {
      miembro.validoParaTotal = false;
      miembro.tachado = true;
    });

    // Para cada categoría duplicada, seleccionar el mejor resultado
    const miembrosSeleccionados: any[] = [];

    for (const [categoria, miembrosCategoria] of categoriasDuplicadas) {
      miembrosCategoria.forEach((m, i) => {
        const esElimTiempo = this.esEliminado(m.tiempo);
        const esElimPuntos = this.esEliminado(m.puntos);
        const esElim = esElimTiempo || esElimPuntos;
      });

      // Ordenar TODOS los miembros: válidos primero, eliminados después
      miembrosCategoria.sort((a, b) => {
        // Primero verificar si alguno está eliminado
        const aEliminado =
          this.esEliminado(a.tiempo) || this.esEliminado(a.puntos);
        const bEliminado =
          this.esEliminado(b.tiempo) || this.esEliminado(b.puntos);

        // Si uno está eliminado y el otro no, el no eliminado va primero
        if (aEliminado && !bEliminado) return 1;
        if (!aEliminado && bEliminado) return -1;

        // Si ambos están eliminados o ambos son válidos, ordenar por puntos y tiempo
        const puntosA =
          typeof a.puntos === 'number' ? a.puntos : Number(a.puntos);
        const puntosB =
          typeof b.puntos === 'number' ? b.puntos : Number(b.puntos);

        if (puntosA !== puntosB) {
          return puntosA - puntosB;
        }

        const tiempoA = this.convertirTiempoASegundos(a.tiempo);
        const tiempoB = this.convertirTiempoASegundos(b.tiempo);
        return tiempoA - tiempoB;
      });

      // Seleccionar el primero (mejor) de la lista ordenada
      const mejor = miembrosCategoria[0];
      const esEliminado =
        this.esEliminado(mejor.tiempo) || this.esEliminado(mejor.puntos);

      console.log(
        `[CATEGORÍA ${categoria}] Miembro seleccionado: ${mejor.nombreJinete} - Puntos: ${mejor.puntos}, Tiempo: ${mejor.tiempo}`
      );

      // Mostrar comparación si hay más de un miembro
      if (miembrosCategoria.length > 1) {
        console.log(
          `[CATEGORÍA ${categoria}] Comparación realizada entre ${miembrosCategoria.length} miembros:`
        );
        for (let i = 0; i < miembrosCategoria.length; i++) {
          const m = miembrosCategoria[i];
          const status = i === 0 ? '✅ SELECCIONADO' : '❌ DESCARTADO';
          console.log(
            `  ${status}: ${m.nombreJinete} - Puntos: ${m.puntos}, Tiempo: ${m.tiempo}`
          );
        }
      }

      // Marcar el seleccionado como válido
      mejor.validoParaTotal = true;
      mejor.tachado = false;
      miembrosSeleccionados.push(mejor);

      // Tachar todos los demás de esta categoría
      for (const miembro of miembrosCategoria) {
        if (miembro !== mejor) {
          miembro.validoParaTotal = false;
          miembro.tachado = true;
        }
      }
    }

    // Agregar miembros de categorías únicas
    miembros.forEach((miembro) => {
      if (!miembro.tachado) return; // Ya procesado

      const categoria = miembro.categoria;
      const esDuplicada = categoriasDuplicadas.some(
        ([cat, _]) => cat === categoria
      );

      if (!esDuplicada) {
        miembro.validoParaTotal = true;
        miembro.tachado = false;
        miembrosSeleccionados.push(miembro);
      }
    });

    // Si tenemos menos de 3 miembros válidos, agregar los mejores de los tachados
    if (miembrosSeleccionados.length < 3) {
      const miembrosTachados = miembros.filter((m) => m.tachado);
      miembrosTachados.sort((a, b) => {
        const puntosA =
          typeof a.puntos === 'number' ? a.puntos : Number(a.puntos);
        const puntosB =
          typeof b.puntos === 'number' ? b.puntos : Number(b.puntos);

        if (puntosA !== puntosB) {
          return puntosA - puntosB;
        }

        const tiempoA = this.convertirTiempoASegundos(a.tiempo);
        const tiempoB = this.convertirTiempoASegundos(b.tiempo);
        return tiempoA - tiempoB;
      });

      const necesarios = Math.min(
        3 - miembrosSeleccionados.length,
        miembrosTachados.length
      );
      for (let i = 0; i < necesarios; i++) {
        miembrosTachados[i].validoParaTotal = true;
        miembrosTachados[i].tachado = false;
      }
    }
  }

  /**
   * Procesa equipos con categorías diferentes pero grupos compatibles
   */
  private procesarGruposCompatibles(miembros: any[]): void {
    // Crear mapa de grupos
    const gruposMap = new Map<string, any[]>();
    miembros.forEach((miembro) => {
      const grupo = this.obtenerGrupoCategoria(miembro.categoria);
      if (grupo) {
        if (!gruposMap.has(grupo)) {
          gruposMap.set(grupo, []);
        }
        gruposMap.get(grupo)!.push(miembro);
      }
    });

    // Marcar todos como no válidos inicialmente
    miembros.forEach((miembro) => {
      miembro.validoParaTotal = false;
      miembro.tachado = true;
    });

    const miembrosSeleccionados: any[] = [];

    // Para cada grupo, seleccionar el mejor miembro
    for (const [grupo, miembrosGrupo] of gruposMap) {
      if (miembrosGrupo.length > 1) {
        // Ordenar por puntos y tiempo
        miembrosGrupo.sort((a, b) => {
          const puntosA =
            typeof a.puntos === 'number' ? a.puntos : Number(a.puntos);
          const puntosB =
            typeof b.puntos === 'number' ? b.puntos : Number(b.puntos);

          if (puntosA !== puntosB) {
            return puntosA - puntosB;
          }

          const tiempoA = this.convertirTiempoASegundos(a.tiempo);
          const tiempoB = this.convertirTiempoASegundos(b.tiempo);
          return tiempoA - tiempoB;
        });

        // El mejor del grupo es válido
        const mejor = miembrosGrupo[0];
        mejor.validoParaTotal = true;
        mejor.tachado = false;
        miembrosSeleccionados.push(mejor);

        // Los demás del grupo se tachan
        for (let i = 1; i < miembrosGrupo.length; i++) {
          miembrosGrupo[i].validoParaTotal = false;
          miembrosGrupo[i].tachado = true;
        }
      } else {
        // Solo un miembro en el grupo, es válido
        const miembro = miembrosGrupo[0];
        miembro.validoParaTotal = true;
        miembro.tachado = false;
        miembrosSeleccionados.push(miembro);
      }
    }

    // Si tenemos menos de 3 miembros válidos, agregar los mejores de los tachados
    if (miembrosSeleccionados.length < 3) {
      const miembrosTachados = miembros.filter((m) => m.tachado);
      miembrosTachados.sort((a, b) => {
        const puntosA =
          typeof a.puntos === 'number' ? a.puntos : Number(a.puntos);
        const puntosB =
          typeof b.puntos === 'number' ? b.puntos : Number(b.puntos);

        if (puntosA !== puntosB) {
          return puntosA - puntosB;
        }

        const tiempoA = this.convertirTiempoASegundos(a.tiempo);
        const tiempoB = this.convertirTiempoASegundos(b.tiempo);
        return tiempoA - tiempoB;
      });

      const necesarios = Math.min(
        3 - miembrosSeleccionados.length,
        miembrosTachados.length
      );
      for (let i = 0; i < necesarios; i++) {
        miembrosTachados[i].validoParaTotal = true;
        miembrosTachados[i].tachado = false;
      }
    }
  }

  // Métodos de descarga Excel
  descargarExcelIndividual() {
    if (this.datos.length === 0) {
      alert('No hay datos para descargar');
      return;
    }

    const datosExcel = this.datos.map((dato, index) => ({
      Clasificación: dato.mostrarClasificacion ? dato.clasificacion : '',
      Jinete: dato.nombreJinete,
      Total: dato.total,
      'Viernes Puntos': dato.viernes.puntos,
      'Viernes Tiempo': dato.viernes.tiempo,
      'Viernes Caballo': dato.viernes.caballo,
      'Sábado Puntos': dato.sabado.puntos,
      'Sábado Tiempo': dato.sabado.tiempo,
      'Sábado Caballo': dato.sabado.caballo,
      'Domingo Puntos': dato.domingo.puntos,
      'Domingo Tiempo': dato.domingo.tiempo,
      'Domingo Caballo': dato.domingo.caballo,
      'Desempate Puntos': dato.desempate.puntos,
      'Desempate Tiempo': dato.desempate.tiempo,
      'Desempate Caballo': dato.desempate.caballo,
      'Desempate Formateado': this.formatearDesempate(dato.desempate),
    }));

    const ws = XLSX.utils.json_to_sheet(datosExcel);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Clasificación');

    const nombreArchivo = `Clasificacion_${this.categoriaSeleccionada}_${
      new Date().toISOString().split('T')[0]
    }.xlsx`;
    XLSX.writeFile(wb, nombreArchivo);
  }

  descargarExcelEquipos() {
    if (this.equipos.length === 0) {
      alert('No hay datos de equipos para descargar');
      return;
    }

    // Crear datos detallados para cada equipo
    const datosExcel = this.equipos.map((equipo, index) => {
      const baseData = {
        Clasificación: index + 1,
        Equipo: equipo.equipo,
        'Jefe de Equipo': equipo.jefeEquipo,
        'Total Puntos': equipo.totalPuntos,
        'Tiempo Total (s)': equipo.totalTiempoSegundos,
      };

      // Agregar información de cada miembro
      const miembrosData: any = {};
      equipo.miembros.forEach((miembro, idx) => {
        const num = idx + 1;
        const estado = miembro.tachado
          ? ' (TACHADO)'
          : miembro.validoParaTotal
          ? ' (VÁLIDO)'
          : '';
        miembrosData[`Miembro ${num}`] = `${miembro.nombreJinete}${estado}`;
        miembrosData[`Licencia ${num}`] = miembro.licencia;
        miembrosData[`Categoría ${num}`] = miembro.categoria;
        miembrosData[`Caballo ${num}`] = miembro.caballo;
        miembrosData[`Puntos ${num}`] = miembro.puntos;
        miembrosData[`Tiempo ${num}`] = miembro.tiempo;
        miembrosData[`Válido para Total ${num}`] = miembro.validoParaTotal
          ? 'SÍ'
          : 'NO';
      });

      return { ...baseData, ...miembrosData };
    });

    const ws = XLSX.utils.json_to_sheet(datosExcel);

    // Ajustar ancho de columnas
    const colWidths = [
      { wch: 8 }, // Clasificación
      { wch: 20 }, // Equipo
      { wch: 20 }, // Jefe de Equipo
      { wch: 12 }, // Total Puntos
      { wch: 15 }, // Tiempo Total
    ];

    // Añadir anchos para las columnas de miembros (4 miembros x 7 campos = 28 columnas)
    for (let i = 0; i < 4; i++) {
      colWidths.push(
        { wch: 20 }, // Miembro
        { wch: 15 }, // Licencia
        { wch: 12 }, // Categoría
        { wch: 15 }, // Caballo
        { wch: 8 }, // Puntos
        { wch: 10 }, // Tiempo
        { wch: 12 } // Válido para Total
      );
    }

    ws['!cols'] = colWidths;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Clasificación Equipos');

    const nombreArchivo = `Clasificacion_Equipos_${
      new Date().toISOString().split('T')[0]
    }.xlsx`;
    XLSX.writeFile(wb, nombreArchivo);
  }

  imprimirEquipos() {
    if (this.equipos.length === 0) {
      alert('No hay datos de equipos para imprimir');
      return;
    }

    // Crear ventana de impresión
    const ventanaImpresion = window.open('', '_blank');
    if (!ventanaImpresion) {
      alert(
        'No se pudo abrir la ventana de impresión. Verifica que los popups estén permitidos.'
      );
      return;
    }

    // Generar HTML para la impresión
    const htmlImpresion = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Clasificación por Equipos - Campeonato 2025</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            margin: 20px;
            color: #333;
          }
          .header {
            text-align: center;
            margin-bottom: 30px;
            border-bottom: 2px solid #2c3e50;
            padding-bottom: 20px;
          }
          .header h1 {
            color: #2c3e50;
            margin: 0;
            font-size: 24px;
          }
          .header h2 {
            color: #7f8c8d;
            margin: 10px 0 0 0;
            font-size: 18px;
          }
          .equipos-container {
            display: flex;
            flex-direction: column;
            gap: 20px;
          }
          .equipo-card {
            border: 1px solid #ddd;
            border-radius: 8px;
            padding: 15px;
            background: #f9f9f9;
            page-break-inside: avoid;
          }
          .equipo-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 15px;
            padding-bottom: 10px;
            border-bottom: 1px solid #ddd;
          }
          .equipo-clasificacion {
            font-size: 24px;
            font-weight: bold;
            color: #2c3e50;
            min-width: 40px;
          }
          .equipo-info h3 {
            margin: 0;
            color: #2c3e50;
            font-size: 18px;
          }
          .equipo-totales {
            text-align: right;
          }
          .total-puntos {
            font-size: 16px;
            font-weight: bold;
            color: #27ae60;
          }
          .total-tiempo {
            font-size: 14px;
            color: #7f8c8d;
          }
          .equipo-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 10px;
          }
          .equipo-table th,
          .equipo-table td {
            border: 1px solid #ddd;
            padding: 8px;
            text-align: left;
          }
          .equipo-table th {
            background-color: #2c3e50;
            color: white;
            font-weight: bold;
          }
          .equipo-table tr:nth-child(even) {
            background-color: #f2f2f2;
          }
          .tachado {
            text-decoration: line-through;
            color: #999;
            background-color: #f5f5f5;
          }
          .top-1 .equipo-clasificacion {
            color: #ffd700;
          }
          .top-2 .equipo-clasificacion {
            color: #c0c0c0;
          }
          .top-3 .equipo-clasificacion {
            color: #cd7f32;
          }
          @media print {
            body { margin: 0; }
            .equipo-card { page-break-inside: avoid; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Campeonato 2025</h1>
          <h2>Clasificación por Equipos</h2>
          <p>Fecha: ${new Date().toLocaleDateString('es-ES')}</p>
        </div>
        <div class="equipos-container">
          ${this.equipos
            .map(
              (eq, idx) => `
            <div class="equipo-card ${
              idx === 0
                ? 'top-1'
                : idx === 1
                ? 'top-2'
                : idx === 2
                ? 'top-3'
                : ''
            }">
              <div class="equipo-header">
                <div class="equipo-clasificacion">${idx + 1}</div>
                <div class="equipo-info">
                  <h3>${eq.equipo.toUpperCase()} / ${eq.jefeEquipo.toUpperCase()}</h3>
                </div>
                <div class="equipo-totales">
                  <div class="total-puntos">${eq.totalPuntos} pts</div>
                  <div class="total-tiempo">${eq.totalTiempoSegundos.toFixed(
                    2
                  )}s</div>
                </div>
              </div>
              <table class="equipo-table">
                <thead>
                  <tr>
                    <th>Jinete</th>
                    <th>Categoría</th>
                    <th>Caballo</th>
                    <th>Puntos</th>
                    <th>Tiempo</th>
                  </tr>
                </thead>
                <tbody>
                  ${eq.miembros
                    .map(
                      (miembro) => `
                    <tr class="${miembro.tachado ? 'tachado' : ''}">
                      <td>${miembro.nombreJinete.toUpperCase()}</td>
                      <td>${miembro.categoria}</td>
                      <td>${miembro.caballo.toUpperCase()}</td>
                      <td>${miembro.puntos}</td>
                      <td>${miembro.tiempo}</td>
                    </tr>
                  `
                    )
                    .join('')}
                </tbody>
              </table>
            </div>
          `
            )
            .join('')}
        </div>
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
          <h1>Campeonato 2025</h1>
          <h2>Clasificación ${this.categoriaSeleccionada}</h2>
          <p>Fecha: ${new Date().toLocaleDateString('es-ES')}</p>
        </div>
        <table class="competition-table">
          <thead>
            <tr>
              ${this.datos[0]?.mostrarClasificacion ? '<th>Clas.</th>' : ''}
              <th>Jinete</th>
              <th>Caballo</th>
              <th class="total-column">Total</th>
              <th>Viernes</th>
              <th>Sábado</th>
              <th>Domingo</th>
              <th>Desempate</th>
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
                <td class="total-column">${dato.total}</td>
                <td>
                  ${
                    dato.viernes?.puntos !== undefined &&
                    dato.viernes?.puntos !== null
                      ? dato.viernes.puntos
                      : '-'
                  }
                </td>
                <td>
                  ${
                    dato.sabado?.puntos !== undefined &&
                    dato.sabado?.puntos !== null
                      ? dato.sabado.puntos
                      : '-'
                  }
                </td>
                <td>
                  ${
                    dato.domingo?.puntos !== undefined &&
                    dato.domingo?.puntos !== null
                      ? dato.domingo.puntos
                      : '-'
                  }
                </td>
                <td>
                  ${this.formatearDesempate(dato.desempate)}
                </td>
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
