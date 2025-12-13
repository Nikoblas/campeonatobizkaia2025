/**
 * Modelos y interfaces para el sistema de competición
 */

/**
 * Representa una fila de datos del Excel con campos dinámicos
 */
export interface CompetitionRow {
  [key: string]: any; // Todos los campos del Excel
}

/**
 * Representa los datos de un archivo de competición
 */
export interface CompetitionFileData {
  concurso: string; // Ej: 'CIZUR'
  dia: string; // Ej: 'SABADO' o 'DOMINGO'
  categoria: string; // Ej: '065', '080', '100', etc.
  datos: CompetitionRow[];
  archivo: string; // Nombre del archivo
}

/**
 * Representa una entrada de equipo
 */
export interface EquipoEntry {
  equipo: string;
  jefeEquipo: string;
  licencia: string;
}

/**
 * Representa una entrada de binomio admitido (lic-lac)
 */
export interface AdmitidoEntry {
  lic: string;
  lac: string;
}

/**
 * Resultado de la importación de datos de competición
 */
export interface CompetitionImportResult {
  resultados: CompetitionFileData[];
  faltantes: string[];
}

/**
 * Resultado de un día de competición
 */
export interface ResultadoDia {
  licencia: string;
  jinete: string;
  caballo: string;
  club: string;
  puntos: number;
  tiempo: string;
}

/**
 * Estructura de una prueba con su clave y día
 */
export interface PruebaConfig {
  key: string;
  dia: string;
}

/**
 * Representa los datos de un día de competición
 */
export interface CompetitionDay {
  puntos: number | string;
  caballo: string;
  tiempo: string;
  cl: string;
  tachado?: boolean;
}

/**
 * Representa los datos completos de un jinete en la competición
 */
export interface CompetitionData {
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
  eliminaciones: number; // Contador de eliminaciones
}

/**
 * Resultado de un jinete en la competición (para admin)
 */
export interface ResultadoJinete {
  concurso: string;
  dia: string;
  categoria: string;
  tiempo: string;
  puntos: number;
  total: number;
  caballo: string;
  lac: string;
  club: string;
  nombre: string;
  licencia: string;
}

/**
 * Sugerencia de búsqueda para autocompletado
 */
export interface SugerenciaBusqueda {
  nombre: string;
  caballo: string;
  tipo: 'jinete' | 'caballo';
  licencia?: string;
}

// ============================================================================
// CONSTANTES Y LISTADOS REUTILIZABLES
// ============================================================================

/**
 * Lista de concursos disponibles
 */
export const CONCURSOS: readonly string[] = ['SEDE'] as const;

/**
 * Lista de categorías disponibles
 */
export const CATEGORIAS: readonly string[] = [
  '080',
  '100',
  '110',
  '120',
  '130',
] as const;

/**
 * Lista de días de competición
 */
export const DIAS: readonly string[] = ['SABADO', 'DOMINGO', 'DESEMPATE'] as const;

/**
 * Lista de días base (sin desempate)
 */
export const DIAS_BASE: readonly string[] = ['SABADO', 'DOMINGO'] as const;

/**
 * Configuración de pruebas con sus claves y días correspondientes
 */
export const PRUEBAS: readonly PruebaConfig[] = [
  { key: 'sabado', dia: 'SABADO' },
  { key: 'domingo', dia: 'DOMINGO' },
  { key: 'desempate', dia: 'DESEMPATE' },
] as const;

/**
 * Variantes de nombres para el campo de licencia
 */
export const LICENCIA_KEYS: readonly string[] = [
  'Licencia',
  'LICENCIA',
  'licencia',
  'Lic',
  'LIC',
  'lic',
] as const;

/**
 * Variantes de nombres para el campo de atleta/jinete
 */
export const ATLETA_KEYS: readonly string[] = [
  'Atleta',
  'Jinete',
  'NOMBRE JINETE',
] as const;

/**
 * Variantes de nombres para el campo de clasificación
 */
export const CL_KEYS: readonly string[] = ['Cl', 'CL', 'cl'] as const;

/**
 * Valores que indican eliminación
 */
export const ELIMINACIONES: readonly string[] = [
  'EL',
  'E',
  'R',
  'ELI',
  'RET',
  'NC',
] as const;

/**
 * Orden de prioridad para columnas al ordenar datos
 */
export const PRIORIDAD_COLUMNAS: readonly string[] = [
  'Clas',
  'CL',
  'Cl',
  'cl',
  'Posicion',
  'Dorsal',
  'DORSAL',
  'dorsal',
  'No. caballo',
  'Puntos',
  'PUNTOS',
  'puntos',
  'Faltas',
  'Tiempo',
  'TIEMPO',
  'tiempo',
  'Atleta',
  'Jinete',
  'NOMBRE JINETE',
  'nombre',
  'Licencia',
  'LICENCIA',
  'licencia',
  'Caballo',
  'CABALLO',
  'caballo',
  'Club',
  'CLUB',
  'club',
  'Reg',
  'Total',
  'TOTAL',
  'total',
] as const;

