import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { CompetitionService } from '../../../services/competition.service';
import { TranslateService } from '../../../services/translate.service';
import { TranslatePipe } from '../../../pipes/translate.pipe';
import {
  DIAS_BASE,
  PRIORIDAD_COLUMNAS,
  ResultadoJinete,
  SugerenciaBusqueda,
} from '../../../models/competition.model';
import { debounceTime, distinctUntilChanged, Subject } from 'rxjs';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import * as XLSX from 'xlsx';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, HttpClientModule, TranslatePipe],
  templateUrl: './admin-dashboard.component.html',
  styleUrls: ['./admin-dashboard.component.scss'],
})
export class AdminDashboardComponent implements OnInit {
  concursos: string[] = [];
  dias: string[] = [];
  categorias: string[] = [];
  currentImport: { concurso: string; dia: string; categoria: string } | null =
    null;
  activeTab: 'resultados' | 'buscador' = 'buscador';
  searchTerm: string = '';
  resultadosBusqueda: ResultadoJinete[] = [];
  isLoading: boolean = false;
  sugerencias: SugerenciaBusqueda[] = [];
  mostrarSugerencias: boolean = false;
  private searchSubject = new Subject<string>();

  constructor(
    private router: Router,
    private competitionService: CompetitionService,
    private translateService: TranslateService,
    private http: HttpClient
  ) {
    this.searchSubject
      .pipe(debounceTime(300), distinctUntilChanged())
      .subscribe((term) => {
        this.buscarSugerencias(term);
      });
  }

  // Método helper para traducir en el componente
  t(key: string, params?: { [key: string]: string }): string {
    return this.translateService.translate(key, params);
  }

  ngOnInit() {
    // Verificar autenticación
    if (!localStorage.getItem('adminAuth')) {
      this.router.navigate(['/admin/login']);
      return;
    }

    this.concursos = this.competitionService.getConcursos();
    this.dias = this.competitionService.getDias();
    this.categorias = this.competitionService.getCategorias();
  }

  getCategoriaVisual(categoria: string): string {
    return this.competitionService.getCategoriaVisual(categoria);
  }

  hasData(concurso: string, dia: string, categoria: string): boolean {
    const data = this.competitionService.getCompetitionFileData(
      concurso,
      dia,
      categoria
    );
    return !!data && data.datos.length > 0;
  }

  importExcel(concurso: string, dia: string, categoria: string) {
    this.currentImport = { concurso, dia, categoria };
    const fileInput = document.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;
    fileInput?.click();
  }

  onFileSelected(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file || !this.currentImport) return;

    // Limpiar el input
    (event.target as HTMLInputElement).value = '';
    this.currentImport = null;
  }

  onSearchInput(term: string) {
    this.searchTerm = term;
    this.searchSubject.next(term);
    this.mostrarSugerencias = true;
  }

  buscarSugerencias(term: string) {
    if (!term.trim()) {
      this.sugerencias = [];
      return;
    }

    const termLower = term.toLowerCase();
    // Cambiamos a un Map para agrupar por licencia
    const sugerenciasMap = new Map<string, SugerenciaBusqueda>();
    this.sugerencias = [];

    this.concursos.forEach((concurso) => {
      this.dias.forEach((dia) => {
        this.categorias.forEach((categoria) => {
          const data = this.competitionService.getCompetitionFileData(
            concurso,
            dia,
            categoria
          );
          if (data?.datos) {
            data.datos.forEach((dato) => {
              const nombre =
                dato['Atleta'] ||
                dato['Jinete'] ||
                dato['NOMBRE JINETE'] ||
                dato['nombre'] ||
                '';
              const caballo =
                dato['Caballo'] || dato['CABALLO'] || dato['caballo'] || '';
              const licencia =
                dato['Licencia'] || dato['LICENCIA'] || dato['licencia'] || '';

              if (nombre.toLowerCase().includes(termLower)) {
                // Usamos la licencia como clave si existe, si no, usamos el nombre
                const key = licencia
                  ? `jinete:${licencia}`
                  : `jinete:${nombre}`;
                if (!sugerenciasMap.has(key)) {
                  sugerenciasMap.set(key, {
                    nombre: licencia ? `${nombre} (${licencia})` : nombre,
                    caballo,
                    tipo: 'jinete',
                    licencia,
                  });
                }
              }
              if (caballo.toLowerCase().includes(termLower)) {
                const key = `caballo:${caballo}`;
                if (!sugerenciasMap.has(key)) {
                  sugerenciasMap.set(key, {
                    nombre,
                    caballo,
                    tipo: 'caballo',
                    licencia,
                  });
                }
              }
            });
          }
        });
      });
    });

    // Convertimos el Map a array y limitamos a 10 sugerencias
    this.sugerencias = Array.from(sugerenciasMap.values()).slice(0, 10);
  }

  seleccionarSugerencia(sugerencia: SugerenciaBusqueda) {
    // Si es un jinete, mostrar solo el nombre sin la licencia
    const nombreSinLicencia = sugerencia.nombre.split(' (')[0];
    this.searchTerm =
      sugerencia.tipo === 'jinete' ? nombreSinLicencia : sugerencia.caballo;
    this.mostrarSugerencias = false;
    this.buscarResultados(sugerencia);
  }

  buscarResultados(sugerencia: SugerenciaBusqueda) {
    this.isLoading = true;
    this.resultadosBusqueda = [];

    this.concursos.forEach((concurso) => {
      this.dias.forEach((dia) => {
        this.categorias.forEach((categoria) => {
          const data = this.competitionService.getCompetitionFileData(
            concurso,
            dia,
            categoria
          );
          if (data?.datos) {
            const resultados = data.datos
              .filter((dato) => {
                const nombre =
                  dato['Atleta'] ||
                  dato['Jinete'] ||
                  dato['NOMBRE JINETE'] ||
                  dato['nombre'] ||
                  '';
                const caballo =
                  dato['Caballo'] || dato['CABALLO'] || dato['caballo'] || '';
                const licencia =
                  dato['Licencia'] ||
                  dato['LICENCIA'] ||
                  dato['licencia'] ||
                  '';

                if (sugerencia.tipo === 'jinete') {
                  // Si hay licencia, comparamos por licencia, si no, por nombre
                  const coincide = sugerencia.licencia
                    ? licencia === sugerencia.licencia
                    : nombre === sugerencia.nombre.split(' (')[0];
                  return coincide;
                } else {
                  const coincide = caballo === sugerencia.caballo;
                  return coincide;
                }
              })
              .map((dato) => ({
                concurso,
                dia,
                categoria,
                tiempo:
                  dato['Tiempo'] || dato['TIEMPO'] || dato['tiempo'] || '-',
                puntos: dato['Puntos'] || dato['PUNTOS'] || dato['puntos'] || 0,
                total: dato['Total'] || dato['TOTAL'] || dato['total'] || 0,
                lac:
                  dato['Licencia_1'] ||
                  dato['LICENCIA_1'] ||
                  dato['licencia_1'] ||
                  '-',
                caballo:
                  dato['Caballo'] || dato['CABALLO'] || dato['caballo'] || '-',
                club: dato['Club'] || dato['CLUB'] || dato['club'] || '-',
                nombre:
                  dato['Atleta'] ||
                  dato['Jinete'] ||
                  dato['NOMBRE JINETE'] ||
                  dato['nombre'] ||
                  '-',
                licencia:
                  dato['Licencia'] ||
                  dato['LICENCIA'] ||
                  dato['licencia'] ||
                  '-',
              }));
            this.resultadosBusqueda.push(...resultados);
          }
        });
      });
    });
    this.isLoading = false;
  }

  logout() {
    localStorage.removeItem('adminAuth');
    this.router.navigate(['/']);
  }

  volverAResultados() {
    this.router.navigate(['/']);
  }

  abrirExcel(concurso: string, dia: string, categoria: string) {
    const fileName = `${dia}${categoria}.xlsx`;
    const filePath = `assets/data/${concurso}/${fileName}`;

    // Descargar el archivo
    this.http.get(filePath, { responseType: 'blob' }).subscribe(
      (blob: Blob) => {
        // Crear un enlace temporal
        const link = document.createElement('a');
        link.href = window.URL.createObjectURL(blob);
        link.download = fileName;

        // Simular clic para descargar
        document.body.appendChild(link);
        link.click();

        // Limpiar
        document.body.removeChild(link);
        window.URL.revokeObjectURL(link.href);
      },
      (error) => {
        console.error('Error al abrir el archivo:', error);
        alert(
          'No se pudo abrir el archivo Excel. Por favor, verifica que el archivo existe.'
        );
      }
    );
  }

  descargarCSV(concurso: string, dia: string, categoria: string) {
    const data = this.competitionService.getCompetitionFileData(
      concurso,
      dia,
      categoria
    );
    if (!data || !data.datos || data.datos.length === 0) return;

    const rows = data.datos;
    const headers = this.obtenerCabecerasCSV(rows);

    const csvLines: string[] = [];
    csvLines.push(headers.join(','));
    for (const row of rows) {
      const line = headers
        .map((h) => this.escapeCsvValue(row[h]))
        .join(',');
      csvLines.push(line);
    }

    const csvContent = csvLines.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const filename = `${concurso}_${dia}_${categoria}.csv`;

    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  exportarExcel(concurso: string, dia: string, categoria: string) {
    const data = this.competitionService.getCompetitionFileData(
      concurso,
      dia,
      categoria
    );
    if (!data || !data.datos || data.datos.length === 0) return;

    const rows = data.datos;
    const headers = this.obtenerCabecerasCSV(rows);

    const worksheet = XLSX.utils.json_to_sheet(rows, { header: headers, skipHeader: false });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, `${dia}-${categoria}`);
    const filename = `${concurso}_${dia}_${categoria}.xlsx`;
    XLSX.writeFile(workbook, filename);
  }

  descargarPlantilla(concurso: string, dia: string, categoria: string) {
    // Crear una plantilla mínima con cabeceras típicas
    const headers = ['Posicion', 'No. caballo', 'Reg', 'Jinete', 'Reg', 'Caballo', 'Faltas', 'Tiempo'];
    // Fila en blanco para que el juez pueda empezar a completar
    const rows: any[] = [];
    const worksheet = XLSX.utils.json_to_sheet(rows, { header: headers, skipHeader: false });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, `${dia}-${categoria}`);
    const filename = `PLANTILLA_${concurso}_${dia}_${categoria}.xlsx`;
    XLSX.writeFile(workbook, filename);
  }

  exportarClasificacion(concurso: string, categoria: string) {
    const diasBase = [...DIAS_BASE];
    const mapa: Map<string, { licencia: string; nombre: string; club: string; caballo?: string; resultados: { dia: string; puntos: number; tiempo?: string; fueEL: boolean; fueELI: boolean; }[]; eliminaciones: number; totalPuntos: number; tiempoDesempate?: number; } > = new Map();

    // Cargar resultados de los 3 días
    diasBase.forEach((dia) => {
      const data = this.competitionService.getCompetitionFileData(concurso, dia, categoria);
      const filas = data?.datos || [];
      filas.forEach((row: any) => {
        const licencia = (row['Licencia'] || row['LICENCIA'] || row['licencia'] || row['Atleta'] || row['Jinete'] || row['NOMBRE JINETE'] || '').toString().trim();
        if (!licencia) return;
        const nombre = (row['Atleta'] || row['Jinete'] || row['NOMBRE JINETE'] || row['nombre'] || '').toString().trim();
        const club = (row['Club'] || row['CLUB'] || row['club'] || '').toString().trim();
        const caballo = (row['Caballo'] || row['CABALLO'] || row['caballo'] || '').toString().trim();
        const puntos = Number(row['Puntos'] || row['PUNTOS'] || row['puntos'] || row['Faltas'] || 0);
        const puntosOriginal = (row['puntosOriginal'] ?? row['Puntos'] ?? row['Faltas'] ?? '').toString().toUpperCase();
        const fueEL = puntosOriginal.includes('EL');
        const fueELI = puntosOriginal.includes('ELI');
        const tiempo = (row['Tiempo'] || row['TIEMPO'] || row['tiempo'] || '').toString();

        if (!mapa.has(licencia)) {
          mapa.set(licencia, { licencia, nombre, club, caballo, resultados: [], eliminaciones: 0, totalPuntos: 0 });
        }
        const item = mapa.get(licencia)!;
        item.resultados.push({ dia, puntos, tiempo, fueEL, fueELI });
        if (fueEL || fueELI) item.eliminaciones += 1;
      });
    });

    // Excluir con 2 eliminaciones (ELI u EL)
    const participantes = Array.from(mapa.values()).filter((p) => p.eliminaciones < 2);

    // Totalizar puntos
    participantes.forEach((p) => {
      p.totalPuntos = p.resultados.reduce((acc, r) => acc + (isNaN(r.puntos) ? 0 : r.puntos), 0);
    });

    // Preparar desempate
    const dataDesempate = this.competitionService.getCompetitionFileData(concurso, 'DESEMPATE', categoria);
    const tiemposDesempate = new Map<string, number>();
    if (dataDesempate?.datos?.length) {
      dataDesempate.datos.forEach((row: any) => {
        const licencia = (row['Licencia'] || row['LICENCIA'] || row['licencia'] || row['Atleta'] || row['Jinete'] || row['NOMBRE JINETE'] || '').toString().trim();
        if (!licencia) return;
        const tiempoStr = (row['Tiempo'] || row['TIEMPO'] || row['tiempo'] || '').toString().replace(',', '.');
        const tiempoNum = parseFloat(tiempoStr) || Number.MAX_SAFE_INTEGER;
        tiemposDesempate.set(licencia, tiempoNum);
      });
    }

    participantes.forEach((p) => {
      p.tiempoDesempate = tiemposDesempate.get(p.licencia);
    });

    // Orden por total asc (menor es mejor). Ajusta si fuese al revés.
    participantes.sort((a, b) => a.totalPuntos - b.totalPuntos);

    // Empates top-3 por tiempo de desempate
    const top3 = participantes.slice(0, Math.min(3, participantes.length));
    const puntosTop3 = top3.map((p) => p.totalPuntos);
    const minTop3 = Math.min(...puntosTop3);
    const maxTop3 = Math.max(...puntosTop3);
    const hayEmpateTop3 = minTop3 === maxTop3 || new Set(puntosTop3).size < puntosTop3.length;

    if (hayEmpateTop3 && tiemposDesempate.size > 0) {
      const puntosObjetivo = top3[0]?.totalPuntos ?? 0;
      const empatados = participantes.filter((p) => p.totalPuntos === puntosObjetivo);
      empatados.sort((a, b) => (a.tiempoDesempate ?? Number.MAX_SAFE_INTEGER) - (b.tiempoDesempate ?? Number.MAX_SAFE_INTEGER));
      const resto = participantes.filter((p) => p.totalPuntos !== puntosObjetivo);
      participantes.splice(0, participantes.length, ...empatados, ...resto);
    }

    // Preparar salida
    const salida = participantes.map((p, idx) => {
      const getDia = (d: string) => p.resultados.find((r) => r.dia === d);
      const sabadoVal = getDia('SABADO');
      const domingoVal = getDia('DOMINGO');
      return {
        Clas: idx + 1,
        Jinete: p.nombre,
        Club: p.club,
        Total: p.totalPuntos,
        'Sábado': sabadoVal?.puntos ?? '-',
        Domingo: domingoVal?.puntos ?? '-',
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(salida);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, `CAT-${categoria}`);
    const filename = `CATEGORIA_${concurso}_${categoria}.xlsx`;
    XLSX.writeFile(workbook, filename);
  }

  descargarPlantillaCategoria(concurso: string, categoria: string) {
    const headers = ['Clas', 'Jinete', 'Club', 'Total', 'Sábado', 'Domingo'];
    const worksheet = XLSX.utils.json_to_sheet([], { header: headers, skipHeader: false });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, `CAT-${categoria}`);
    const filename = `PLANTILLA_CATEGORIA_${concurso}_${categoria}.xlsx`;
    XLSX.writeFile(workbook, filename);
  }

  private esEmpateConTresResultados(participante: { totalPuntos: number; resultados: any[] }, lista: { totalPuntos: number; resultados: any[] }[]): boolean {
    const mismosPuntos = lista.filter((p) => p.totalPuntos === participante.totalPuntos);
    if (mismosPuntos.length <= 1) return false;
    const conTres = mismosPuntos.filter((p) => p.resultados.filter((r: any) => !isNaN(r.puntos)).length >= 3);
    return conTres.length >= 2;
  }

  private obtenerCabecerasCSV(rows: any[]): string[] {
    const contador: Record<string, number> = {};
    rows.forEach((r) => {
      Object.keys(r).forEach((k) => {
        contador[k] = (contador[k] || 0) + 1;
      });
    });
    const ordenadas = Object.keys(contador).sort((a, b) => contador[b] - contador[a]);
    const prioridad = [...PRIORIDAD_COLUMNAS];
    const setOrdenadas = new Set(ordenadas);
    const cabeceras: string[] = [];
    prioridad.forEach((p) => { if (setOrdenadas.has(p)) cabeceras.push(p); });
    ordenadas.forEach((k) => { if (!cabeceras.includes(k)) cabeceras.push(k); });
    return cabeceras;
  }

  private escapeCsvValue(value: any): string {
    if (value === null || value === undefined) return '';
    let str = String(value);
    str = str.replace(/\r?\n|\r/g, ' ');
    const mustQuote = /[",\n]/.test(str);
    if (mustQuote) {
      str = '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  }
}
