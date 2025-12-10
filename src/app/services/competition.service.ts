import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import {
  Observable,
  forkJoin,
  map,
  catchError,
  of,
  BehaviorSubject,
} from 'rxjs';
import * as XLSX from 'xlsx';

export interface CompetitionRow {
  [key: string]: any; // Todos los campos del Excel
}

export interface CompetitionFileData {
  concurso: string; // Ej: 'CIZUR'
  dia: string; // Ej: 'SABADO' o 'DOMINGO'
  categoria: string; // Ej: '065', '080', '100', etc.
  datos: CompetitionRow[];
  archivo: string; // Nombre del archivo
}

export interface EquipoEntry {
  equipo: string;
  jefeEquipo: string;
  licencia: string;
}

export interface CompetitionImportResult {
  resultados: CompetitionFileData[];
  faltantes: string[];
}

interface ResultadoDia {
  licencia: string;
  jinete: string;
  caballo: string;
  club: string;
  puntos: number;
  tiempo: string;
}

@Injectable({
  providedIn: 'root',
})
export class CompetitionService {
  private readonly concursos = ['SEDE'];
  private readonly categorias = [
    '080',
    '100',
    '110',
    '120',
    '130',
  ];
  private readonly dias = ['SABADO', 'DOMINGO', 'DESEMPATE'];

  private datosMemoria: { [concurso: string]: CompetitionFileData[] } = {};
  private faltantesMemoria: { [concurso: string]: string[] } = {};
  private datosCargados$ = new BehaviorSubject<boolean>(false);
  private errorCarga$ = new BehaviorSubject<string | null>(null);
  private equiposMemoria: EquipoEntry[] | null = null;

  constructor(private http: HttpClient) {
    this.importarTodosLosDatos();
  }

  getConcursos(): string[] {
    return this.concursos;
  }

  getCategorias(): string[] {
    return this.categorias;
  }

  getDias(): string[] {
    return this.dias;
  }

  /**
   * Convierte una categoría interna (ej: '080') a formato visual (ej: '0,80m')
   */
  getCategoriaVisual(categoria: string): string {
    // Convertir '080' a '0,80m', '100' a '1,00m', etc.
    if (categoria.length === 3 && /^\d{3}$/.test(categoria)) {
      const metros = categoria.substring(0, 1);
      const centimetros = categoria.substring(1, 3);
      return `${metros},${centimetros}m`;
    }
    return categoria;
  }

  /**
   * Observable para saber si los datos ya están cargados en memoria
   */
  get datosListos$(): Observable<boolean> {
    return this.datosCargados$.asObservable();
  }

  /**
   * Observable para saber si hubo error en la carga
   */
  get errorCarga(): Observable<string | null> {
    return this.errorCarga$.asObservable();
  }

  /**
   * Importa todos los datos de todos los concursos y los guarda en memoria
   */
  private importarTodosLosDatos() {
    this.datosCargados$.next(false);
    this.errorCarga$.next(null);

    const allRequests: Observable<CompetitionImportResult>[] = [];
    for (const concurso of this.concursos) {
      allRequests.push(this.getAllCompetitionDataFromFiles(concurso));
    }

    forkJoin(allRequests).subscribe({
      next: (results) => {
        results.forEach((result, idx) => {
          const concurso = this.concursos[idx];
          this.datosMemoria[concurso] = result.resultados;
          this.faltantesMemoria[concurso] = result.faltantes;
        });
        this.datosCargados$.next(true);
      },
      error: (error) => {
        console.error('[Import] Error al cargar los datos:', error);
        this.errorCarga$.next(
          'Error al cargar los datos de competición. Por favor, recarga la página.'
        );
      },
    });
  }

  /**
   * Devuelve los datos de un archivo desde memoria
   */
  getCompetitionFileData(
    concurso: string,
    dia: string,
    categoria: string
  ): CompetitionFileData | undefined {
    const lista = this.datosMemoria[concurso] || [];
    return lista.find((d) => d.dia === dia && d.categoria === categoria);
  }

  /**
   * Devuelve todos los datos de un concurso desde memoria
   */
  getAllCompetitionData(concurso: string): CompetitionFileData[] {
    return this.datosMemoria[concurso] || [];
  }

  /**
   * Devuelve los archivos faltantes de un concurso
   */
  getFaltantes(concurso: string): string[] {
    return this.faltantesMemoria[concurso] || [];
  }

  /**
   * Importa todos los datos de un concurso desde los archivos Excel (solo uso interno)
   */
  private getAllCompetitionDataFromFiles(
    concurso: string
  ): Observable<CompetitionImportResult> {
    const requests: Observable<CompetitionFileData | { faltante: string }>[] =
      [];
    for (const dia of this.dias) {
      for (const categoria of this.categorias) {
        requests.push(
          this.getCompetitionFileDataFromFile(concurso, dia, categoria)
        );
      }
    }
    return forkJoin(requests).pipe(
      map((results) => {
        const encontrados: CompetitionFileData[] = [];
        const faltantes: string[] = [];
        for (const r of results) {
          if ('faltante' in r) {
            faltantes.push(r.faltante);
          } else {
            encontrados.push(r);
          }
        }
        return { resultados: encontrados, faltantes };
      })
    );
  }

  /**
   * Carga el Excel de equipos (columnas: Equipo, Licencia) y lo guarda en memoria
   */
  loadEquipos(): Observable<EquipoEntry[]> {
    if (this.equiposMemoria) {
      return of(this.equiposMemoria);
    }
    const pathXlsx = `assets/data/SEDE/EQUIPOS.xlsx`;
    const pathXls = `assets/data/SEDE/EQUIPOS.xls`;
    return this.http.get(pathXlsx, { responseType: 'arraybuffer' }).pipe(
      map((data) => this.parseEquiposExcel(data)),
      catchError(() =>
        this.http
          .get(pathXls, { responseType: 'arraybuffer' })
          .pipe(map((data) => this.parseEquiposExcel(data)))
      )
    );
  }

  private parseEquiposExcel(data: ArrayBuffer): EquipoEntry[] {
    const workbook = XLSX.read(data, { type: 'array' });
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const json: any[] = XLSX.utils.sheet_to_json(worksheet);
    const entries: EquipoEntry[] = json
      .map((row) => ({
        equipo: (row['Equipo'] || row['EQUIPO'] || row['equipo'] || '')
          .toString()
          .trim(),
        jefeEquipo: (
          row['Jefe_Equipo'] ||
          row['JEFE_EQUIPO'] ||
          row['jefe_equipo'] ||
          row['Jefe Equipo'] ||
          ''
        )
          .toString()
          .trim(),
        licencia: (row['Licencia'] || row['LICENCIA'] || row['licencia'] || '')
          .toString()
          .trim(),
      }))
      .filter((e) => e.equipo && e.licencia);
    this.equiposMemoria = entries;
    return entries;
  }

  /**
   * Carga un archivo Excel concreto (solo uso interno)
   */
  private getCompetitionFileDataFromFile(
    concurso: string,
    dia: string,
    categoria: string
  ): Observable<CompetitionFileData | { faltante: string }> {
    const baseName = `${dia}${categoria}`;
    const filePathXlsx = `assets/data/${concurso}/${baseName}.xlsx`;
    const filePathXls = `assets/data/${concurso}/${baseName}.xls`;
    // Intentar primero .xlsx y luego .xls
    return this.http.get(filePathXlsx, { responseType: 'arraybuffer' }).pipe(
      map((data) => {
        const workbook = XLSX.read(data, { type: 'array' });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        let jsonData = XLSX.utils.sheet_to_json(worksheet);
        // Filtrar filas vacías
        jsonData = jsonData.filter((row: any) =>
          Object.values(row).some(
            (v) => v !== null && v !== undefined && v !== ''
          )
        );
        // Calcular la puntuación más alta de la tabla (solo valores numéricos)
        const maxPuntos = Math.max(
          ...jsonData
            .map((row: any) => limpiarPuntos(row['Puntos']))
            .filter((v: any) => typeof v === 'number' && !isNaN(v))
        );
        // Limpiar puntos y asignar el máximo+20 a EL/RET
        jsonData = jsonData.map((row: any) => {
          const valor = row['Puntos'];
          if (
            typeof valor === 'string' &&
            ['EL', 'ELI', 'E', 'R', 'RET'].includes(valor.trim().toUpperCase())
          ) {
            const valMayus = valor.trim().toUpperCase();
            return {
              ...row,
              Puntos: maxPuntos + 20,
              Cl: valMayus,
              CL: valMayus,
              cl: valMayus,
            };
          }
          return { ...row, Puntos: limpiarPuntos(valor) };
        });

        // Lógica especial para 'EL' y 'RET' en puntos por jinete/licencia
        const licenciaKey = ['Licencia', 'LICENCIA', 'licencia'];
        const atletaKey = ['Atleta', 'Jinete', 'NOMBRE JINETE'];
        const puntosKey = 'Puntos';
        const clKey = ['Cl', 'CL', 'cl'];
        const mapLicencia: {
          [lic: string]: { lastClNum: number | null; elValue: number | null };
        } = {};
        for (let i = 0; i < jsonData.length; i++) {
          const row: any = jsonData[i];
          const licencia =
            licenciaKey.map((k) => row[k]).find((v) => !!v) ||
            atletaKey.map((k) => row[k]).find((v) => !!v) ||
            '';
          if (!licencia) continue;
          if (!mapLicencia[licencia])
            mapLicencia[licencia] = { lastClNum: null, elValue: null };
          let valor = row[puntosKey];
          row['puntosOriginal'] = valor;
          // Buscar si el CL de esta fila es numérico
          let clValor = clKey
            .map((k) => row[k])
            .find(
              (v) =>
                v !== undefined && v !== null && v !== '' && !isNaN(Number(v))
            );
          if (
            clValor !== undefined &&
            clValor !== null &&
            clValor !== '' &&
            !isNaN(Number(clValor))
          ) {
            // Si hay CL numérico, actualizamos el último CL y elValue
            mapLicencia[licencia].lastClNum = Number(row[puntosKey]);
            mapLicencia[licencia].elValue = null;
          }
          if (
            typeof valor === 'string' &&
            ['EL', 'ELI', 'E', 'R', 'RET'].includes(valor.trim().toUpperCase())
          ) {
            if (mapLicencia[licencia].elValue !== null) {
              row[puntosKey] = mapLicencia[licencia].elValue;
            } else if (mapLicencia[licencia].lastClNum !== null) {
              row[puntosKey] = mapLicencia[licencia].lastClNum + 20;
              mapLicencia[licencia].elValue = row[puntosKey];
            } else {
              row[puntosKey] = 20; // Si no hay ningún resultado anterior, se pone 20
              mapLicencia[licencia].elValue = 20;
            }
          } else if (
            !(
              clValor !== undefined &&
              clValor !== null &&
              clValor !== '' &&
              !isNaN(Number(clValor))
            )
          ) {
            // Limpiar puntos normalmente si no es una fila con CL numérico
            row[puntosKey] = limpiarPuntos(valor);
          }
        }

        return {
          concurso,
          dia,
          categoria,
          datos: jsonData as CompetitionRow[],
          archivo: `${baseName}.xlsx`,
        };
      }),
      catchError(() => {
        return this.http.get(filePathXls, { responseType: 'arraybuffer' }).pipe(
          map((data) => {
            const workbook = XLSX.read(data, { type: 'array' });
            const worksheet = workbook.Sheets[workbook.SheetNames[0]];
            let jsonData = XLSX.utils.sheet_to_json(worksheet);
            jsonData = jsonData.filter((row: any) =>
              Object.values(row).some(
                (v) => v !== null && v !== undefined && v !== ''
              )
            );
            const maxPuntos = Math.max(
              ...jsonData
                .map((row: any) => limpiarPuntos(row['Puntos']))
                .filter((v: any) => typeof v === 'number' && !isNaN(v))
            );
            jsonData = jsonData.map((row: any) => {
              const valor = row['Puntos'];
              if (
                typeof valor === 'string' &&
                ['EL', 'ELI', 'E', 'R', 'RET'].includes(
                  valor.trim().toUpperCase()
                )
              ) {
                const valMayus = valor.trim().toUpperCase();
                return {
                  ...row,
                  Puntos: maxPuntos + 20,
                  Cl: valMayus,
                  CL: valMayus,
                  cl: valMayus,
                };
              }
              return { ...row, Puntos: limpiarPuntos(valor) };
            });
            const licenciaKey = ['Licencia', 'LICENCIA', 'licencia'];
            const atletaKey = ['Atleta', 'Jinete', 'NOMBRE JINETE'];
            const puntosKey = 'Puntos';
            const clKey = ['Cl', 'CL', 'cl'];
            const mapLicencia: {
              [lic: string]: {
                lastClNum: number | null;
                elValue: number | null;
              };
            } = {};
            for (let i = 0; i < jsonData.length; i++) {
              const row: any = jsonData[i];
              const licencia =
                licenciaKey.map((k) => row[k]).find((v) => !!v) ||
                atletaKey.map((k) => row[k]).find((v) => !!v) ||
                '';
              if (!licencia) continue;
              if (!mapLicencia[licencia])
                mapLicencia[licencia] = { lastClNum: null, elValue: null };
              let valor = row[puntosKey];
              row['puntosOriginal'] = valor;
              let clValor = clKey
                .map((k) => row[k])
                .find(
                  (v) =>
                    v !== undefined &&
                    v !== null &&
                    v !== '' &&
                    !isNaN(Number(v))
                );
              if (
                clValor !== undefined &&
                clValor !== null &&
                clValor !== '' &&
                !isNaN(Number(clValor))
              ) {
                mapLicencia[licencia].lastClNum = Number(row[puntosKey]);
                mapLicencia[licencia].elValue = null;
              }
              if (
                typeof valor === 'string' &&
                ['EL', 'ELI', 'E', 'R', 'RET'].includes(
                  valor.trim().toUpperCase()
                )
              ) {
                if (mapLicencia[licencia].elValue !== null) {
                  row[puntosKey] = mapLicencia[licencia].elValue;
                } else if (mapLicencia[licencia].lastClNum !== null) {
                  row[puntosKey] = mapLicencia[licencia].lastClNum + 20;
                  mapLicencia[licencia].elValue = row[puntosKey];
                } else {
                  row[puntosKey] = 20;
                  mapLicencia[licencia].elValue = 20;
                }
              } else if (
                !(
                  clValor !== undefined &&
                  clValor !== null &&
                  clValor !== '' &&
                  !isNaN(Number(clValor))
                )
              ) {
                row[puntosKey] = limpiarPuntos(valor);
              }
            }
            return {
              concurso,
              dia,
              categoria,
              datos: jsonData as CompetitionRow[],
              archivo: `${baseName}.xls`,
            };
          }),
          catchError(() => of({ faltante: filePathXlsx }))
        );
      })
    );
  }

  /**
   * Refresca todos los datos (por si cambian los excels)
   */
  refrescarDatos() {
    this.datosCargados$.next(false);
    this.importarTodosLosDatos();
  }

  getResultadosPorDia(categoria: number, dia: string): ResultadoDia[] {
    const resultados: ResultadoDia[] = [];
    const concursos = ['heras', 'cizur', 'getxo', 'mungia', 'jaizubia'];

    concursos.forEach((concurso) => {
      const diaKey = dia === 'Sábado' ? 'Sabado' : 'Domingo';
      const concursoKey = `${concurso}${diaKey}`;

      this.datosMemoria[concurso].forEach((dato) => {
        const resultado = dato['datos'].find(
          (d) => d['categoria'] === categoria.toString()
        ) as any;
        if (resultado && resultado.puntos) {
          resultados.push({
            licencia:
              dato['datos'].find((d) => d['categoria'] === 'LICENCIA')?.[
                'datos'
              ][0].licencia || '',
            jinete:
              dato['datos'].find((d) => d['categoria'] === 'NOMBRE JINETE')?.[
                'datos'
              ][0].nombreJinete || '',
            caballo: resultado.caballo,
            club:
              dato['datos'].find((d) => d['categoria'] === 'CLUB')?.['datos'][0]
                .club || '',
            puntos: resultado.puntos,
            tiempo: resultado.tiempo,
          });
        }
      });
    });

    return resultados;
  }
}

function limpiarPuntos(valor: string | number): number {
  if (typeof valor === 'number') return valor;
  const match = (valor || '').toString().match(/^\d+/);
  return match ? parseInt(match[0], 10) : 0;
}

function normalizarFilas(jsonData: any[]): any[] {
  // Filtrar filas vacías
  let data = jsonData.filter((row: any) =>
    Object.values(row).some((v) => v !== null && v !== undefined && v !== '')
  );

  // Mapear columnas alternativas
  data = data.map((row: any) => {
    const mapped = { ...row };
    if (mapped['Faltas'] !== undefined && mapped['Puntos'] === undefined) {
      mapped['Puntos'] = mapped['Faltas'];
    }
    if (mapped['No. caballo'] !== undefined && mapped['Dorsal'] === undefined) {
      mapped['Dorsal'] = mapped['No. caballo'];
    }
    if (mapped['Lic'] !== undefined && mapped['Licencia'] === undefined) {
      mapped['Licencia'] = mapped['Lic'];
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
    return mapped;
  });

  // Calcular máximo Puntos numéricos
  const maxPuntos = Math.max(
    ...data
      .map((row: any) => limpiarPuntos(row['Puntos']))
      .filter((v: any) => typeof v === 'number' && !isNaN(v))
  );

  // Sustituir EL/RET por max+20 y mantener CL en mayúsculas
  data = data.map((row: any) => {
    const valor = row['Puntos'];
    if (
      typeof valor === 'string' &&
      ['EL', 'ELI', 'E', 'R', 'RET'].includes(valor.trim().toUpperCase())
    ) {
      const valMayus = valor.trim().toUpperCase();
      return {
        ...row,
        Puntos: maxPuntos + 20,
        Cl: valMayus,
        CL: valMayus,
        cl: valMayus,
      };
    }
    return { ...row, Puntos: limpiarPuntos(valor) };
  });

  // Lógica especial ELI/EL por licencia
  const licenciaKey = ['Licencia', 'LICENCIA', 'licencia'];
  const atletaKey = ['Atleta', 'Jinete', 'NOMBRE JINETE'];
  const puntosKey = 'Puntos';
  const clKey = ['Cl', 'CL', 'cl'];
  const mapLicencia: {
    [lic: string]: { lastClNum: number | null; elValue: number | null };
  } = {};
  for (let i = 0; i < data.length; i++) {
    const row: any = data[i];
    const licencia =
      licenciaKey.map((k) => row[k]).find((v) => !!v) ||
      atletaKey.map((k) => row[k]).find((v) => !!v) ||
      '';
    if (!licencia) continue;
    if (!mapLicencia[licencia])
      mapLicencia[licencia] = { lastClNum: null, elValue: null };
    let valor = row[puntosKey];
    row['puntosOriginal'] =
      row['puntosOriginal'] ?? row['Puntos'] ?? row['Faltas'];
    let clValor = clKey
      .map((k) => row[k])
      .find(
        (v) => v !== undefined && v !== null && v !== '' && !isNaN(Number(v))
      );
    if (
      clValor !== undefined &&
      clValor !== null &&
      clValor !== '' &&
      !isNaN(Number(clValor))
    ) {
      mapLicencia[licencia].lastClNum = Number(row[puntosKey]);
      mapLicencia[licencia].elValue = null;
    }
    if (
      typeof valor === 'string' &&
      ['EL', 'ELI', 'E', 'R', 'RET'].includes(valor.trim().toUpperCase())
    ) {
      if (mapLicencia[licencia].elValue !== null) {
        row[puntosKey] = mapLicencia[licencia].elValue;
      } else if (mapLicencia[licencia].lastClNum !== null) {
        row[puntosKey] = mapLicencia[licencia].lastClNum + 20;
        mapLicencia[licencia].elValue = row[puntosKey];
      } else {
        row[puntosKey] = 20;
        mapLicencia[licencia].elValue = 20;
      }
    } else if (
      !(
        clValor !== undefined &&
        clValor !== null &&
        clValor !== '' &&
        !isNaN(Number(clValor))
      )
    ) {
      row[puntosKey] = limpiarPuntos(valor);
    }
  }

  return data;
}
