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
import {
  CompetitionRow,
  CompetitionFileData,
  EquipoEntry,
  AdmitidoEntry,
  CompetitionImportResult,
  ResultadoDia,
  CONCURSOS,
  CATEGORIAS,
  DIAS,
  LICENCIA_KEYS,
  ATLETA_KEYS,
  CL_KEYS,
  ELIMINACIONES,
} from '../models/competition.model';

@Injectable({
  providedIn: 'root',
})
export class CompetitionService {
  private readonly concursos = [...CONCURSOS];
  private readonly categorias = [...CATEGORIAS];
  private readonly dias = [...DIAS];

  private datosMemoria: { [concurso: string]: CompetitionFileData[] } = {};
  private faltantesMemoria: { [concurso: string]: string[] } = {};
  private datosCargados$ = new BehaviorSubject<boolean>(false);
  private errorCarga$ = new BehaviorSubject<string | null>(null);
  private equiposMemoria: EquipoEntry[] | null = null;
  private admitidosMemoria: Set<string> | null = null; // Set de strings "lic-lac"

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

    // Primero cargar los admitidos
    this.loadAdmitidos().subscribe({
      next: () => {
        // Una vez cargados los admitidos, cargar los datos de competición
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
      },
      error: (error) => {
        console.error('[Import] Error al cargar admitidos:', error);
        // Continuar aunque falle la carga de admitidos (puede que no exista el archivo)
        this.admitidosMemoria = new Set();
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
   * Carga el Excel de admitidos (columnas: lic, lac) y lo guarda en memoria
   */
  private loadAdmitidos(): Observable<void> {
    if (this.admitidosMemoria) {
      return of(void 0);
    }
    const pathXls = `assets/data/SEDE/admitidos.xls`;
    const pathXlsx = `assets/data/SEDE/admitidos.xlsx`;
    return this.http.get(pathXls, { responseType: 'arraybuffer' }).pipe(
      map((data) => {
        this.parseAdmitidosExcel(data);
        return void 0;
      }),
      catchError(() =>
        this.http
          .get(pathXlsx, { responseType: 'arraybuffer' })
          .pipe(
            map((data) => {
              this.parseAdmitidosExcel(data);
              return void 0;
            }),
            catchError(() => {
              // Si no existe el archivo, crear un Set vacío
              this.admitidosMemoria = new Set();
              return of(void 0);
            })
          )
      )
    );
  }

  /**
   * Parsea el Excel de admitidos y almacena los binomios lic-lac
   */
  private parseAdmitidosExcel(data: ArrayBuffer): void {
    const workbook = XLSX.read(data, { type: 'array' });
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const json: any[] = XLSX.utils.sheet_to_json(worksheet);
    
    const admitidosSet = new Set<string>();
    
    json.forEach((row) => {
      const lic = (
        row['lic'] ||
        row['LIC'] ||
        row['Lic'] ||
        row['Licencia'] ||
        row['LICENCIA'] ||
        row['licencia'] ||
        row['Lic'] ||
        ''
      )
        .toString()
        .trim();
      
      const lac = (
        row['lac'] ||
        row['LAC'] ||
        row['Lac'] ||
        ''
      )
        .toString()
        .trim();
      
      // Solo añadir si ambos valores existen y no están vacíos
      if (lic && lac) {
        // Crear una clave única para el binomio lic-lac (normalizado)
        const clave = `${lic}-${lac}`;
        admitidosSet.add(clave);
      }
    });
    
    this.admitidosMemoria = admitidosSet;
  }

  /**
   * Verifica si un binomio lic-lac está en la lista de admitidos
   */
  private esAdmitido(lic: string, lac: string): boolean {
    if (!this.admitidosMemoria || this.admitidosMemoria.size === 0) {
      // Si no hay lista de admitidos, permitir todos
      return true;
    }
    // Normalizar valores (trim y convertir a string)
    const licNormalizado = (lic || '').toString().trim();
    const lacNormalizado = (lac || '').toString().trim();
    
    // Si alguno está vacío, no está admitido (a menos que no haya lista)
    if (!licNormalizado || !lacNormalizado) {
      return false;
    }
    
    const clave = `${licNormalizado}-${lacNormalizado}`;
    return this.admitidosMemoria.has(clave);
  }

  /**
   * Carga el Excel de equipos (columnas: Equipo, Licencia) y lo guarda en memoria
   */
  loadEquipos(): Observable<EquipoEntry[]> {
    if (this.equiposMemoria) {
      return of(this.equiposMemoria);
    }
    const pathXls = `assets/data/SEDE/EQUIPOS.xls`;
    const pathXlsx = `assets/data/SEDE/EQUIPOS.xlsx`;
    return this.http.get(pathXls, { responseType: 'arraybuffer' }).pipe(
      map((data) => this.parseEquiposExcel(data)),
      catchError(() =>
        this.http
          .get(pathXlsx, { responseType: 'arraybuffer' })
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
    const filePathXls = `assets/data/${concurso}/${baseName}.xls`;
    const filePathXlsx = `assets/data/${concurso}/${baseName}.xlsx`;
    // Intentar primero .xls y luego .xlsx
    return this.http.get(filePathXls, { responseType: 'arraybuffer' }).pipe(
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
        
        // Filtrar por lista de admitidos (lic-lac)
        jsonData = jsonData.filter((row: any) => {
          const lic = (
            row['Lic'] ||
            row['LIC'] ||
            row['lic'] ||
            row['Licencia'] ||
            row['LICENCIA'] ||
            row['licencia'] ||
            ''
          )
            .toString()
            .trim();
          
          const lac = (
            row['Lac'] ||
            row['LAC'] ||
            row['lac'] ||
            ''
          )
            .toString()
            .trim();
          
          // Si no hay lista de admitidos o ambos valores están vacíos, permitir
          if (!this.admitidosMemoria || this.admitidosMemoria.size === 0) {
            return true;
          }
          
          // Solo incluir si está en la lista de admitidos
          return this.esAdmitido(lic, lac);
        });
        
        // Calcular la puntuación más alta de la tabla (solo valores numéricos)
        const maxPuntos = Math.max(
          ...jsonData
            .map((row: any) => limpiarPuntos(row['Puntos']))
            .filter((v: any) => typeof v === 'number' && !isNaN(v))
        );
        // Limpiar puntos y mantener eliminaciones como están (sin sumar puntos)
        jsonData = jsonData.map((row: any) => {
          const valor = row['Puntos'];
          if (
            typeof valor === 'string' &&
            ELIMINACIONES.includes(valor.trim().toUpperCase() as any)
          ) {
            const valMayus = valor.trim().toUpperCase();
            return {
              ...row,
              Puntos: valor, // Mantener el valor original de eliminación
              Cl: valMayus,
              CL: valMayus,
              cl: valMayus,
            };
          }
          return { ...row, Puntos: limpiarPuntos(valor) };
        });

        // Lógica especial para 'EL' y 'RET' en puntos por jinete/licencia
        const licenciaKey = [...LICENCIA_KEYS];
        const atletaKey = [...ATLETA_KEYS];
        const puntosKey = 'Puntos';
        const clKey = [...CL_KEYS];
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
            ELIMINACIONES.includes(valor.trim().toUpperCase() as any)
          ) {
            // Mantener el valor original de eliminación sin procesar
            row[puntosKey] = valor;
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
          archivo: `${baseName}.xls`,
        };
      }),
      catchError(() => {
        return this.http.get(filePathXlsx, { responseType: 'arraybuffer' }).pipe(
          map((data) => {
            const workbook = XLSX.read(data, { type: 'array' });
            const worksheet = workbook.Sheets[workbook.SheetNames[0]];
            let jsonData = XLSX.utils.sheet_to_json(worksheet);
            jsonData = jsonData.filter((row: any) =>
              Object.values(row).some(
                (v) => v !== null && v !== undefined && v !== ''
              )
            );
            
            // Filtrar por lista de admitidos (lic-lac)
            jsonData = jsonData.filter((row: any) => {
              const lic = (
                row['Lic'] ||
                row['LIC'] ||
                row['lic'] ||
                row['Licencia'] ||
                row['LICENCIA'] ||
                row['licencia'] ||
                ''
              )
                .toString()
                .trim();
              
              const lac = (
                row['Lac'] ||
                row['LAC'] ||
                row['lac'] ||
                ''
              )
                .toString()
                .trim();
              
              // Si no hay lista de admitidos o ambos valores están vacíos, permitir
              if (!this.admitidosMemoria || this.admitidosMemoria.size === 0) {
                return true;
              }
              
              // Solo incluir si está en la lista de admitidos
              return this.esAdmitido(lic, lac);
            });
            
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
                  Puntos: valor, // Mantener el valor original de eliminación
                  Cl: valMayus,
                  CL: valMayus,
                  cl: valMayus,
                };
              }
              return { ...row, Puntos: limpiarPuntos(valor) };
            });
            const licenciaKey = [...LICENCIA_KEYS];
            const atletaKey = [...ATLETA_KEYS];
            const puntosKey = 'Puntos';
            const clKey = [...CL_KEYS];
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
                } else if (mapLicencia[licencia].lastClNum !== null && mapLicencia[licencia].lastClNum !== undefined) {
                  row[puntosKey] = mapLicencia[licencia].lastClNum! + 20;
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
              archivo: `${baseName}.xlsx`,
            };
          }),
          catchError(() => of({ faltante: filePathXls }))
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
        Puntos: valor, // Mantener el valor original de eliminación
        Cl: valMayus,
        CL: valMayus,
        cl: valMayus,
      };
    }
    return { ...row, Puntos: limpiarPuntos(valor) };
  });

  // Lógica especial ELI/EL por licencia
  const licenciaKey = [...LICENCIA_KEYS];
  const atletaKey = [...ATLETA_KEYS];
  const puntosKey = 'Puntos';
  const clKey = [...CL_KEYS];
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
      } else if (mapLicencia[licencia].lastClNum !== null && mapLicencia[licencia].lastClNum !== undefined) {
        row[puntosKey] = mapLicencia[licencia].lastClNum! + 20;
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
