import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import {
  CompetitionService,
  CompetitionFileData,
  CompetitionRow,
} from '../../services/competition.service';
import * as XLSX from 'xlsx';

@Component({
  selector: 'app-competition-explorer',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './competition-explorer.component.html',
  styleUrls: ['./competition-explorer.component.scss'],
})
export class CompetitionExplorerComponent {
  concursos: string[] = [];
  dias: string[] = [];
  categorias: string[] = [];

  concursoSeleccionado = 'SEDE';
  diaSeleccionado = '';
  categoriaSeleccionada = '';

  datos: CompetitionRow[] = [];
  columnasPrincipales = [
    'O.S.',
    'Cl',
    'Atleta',
    'Caballo',
    'Club',
    'Puntos',
    'Tiempo',
  ];

  filaSeleccionada: CompetitionRow | null = null;
  mostrarPopup = false;

  constructor(private competitionService: CompetitionService) {
    this.concursos = this.competitionService.getConcursos();
    this.dias = this.competitionService.getDias();
    this.categorias = this.competitionService.getCategorias().slice(1);
    this.concursoSeleccionado = this.concursos[0] || 'SEDE';
    this.diaSeleccionado = this.dias[0];
    this.categoriaSeleccionada = this.categorias[0];
    this.cargarDatos();
  }

  getCategoriaVisual(categoria: string): string {
    return this.competitionService.getCategoriaVisual(categoria);
  }

  cargarDatos() {
    const data = this.competitionService.getCompetitionFileData(
      this.concursoSeleccionado,
      this.diaSeleccionado,
      this.categoriaSeleccionada
    );
    if (data && data.datos) {
      this.datos = data.datos;
    } else {
      this.datos = [];
    }
  }

  onSeleccionarFila(fila: CompetitionRow) {
    this.filaSeleccionada = fila;
    this.mostrarPopup = true;
  }

  cerrarPopup() {
    this.mostrarPopup = false;
    this.filaSeleccionada = null;
  }

  descargarExcel() {
    if (this.datos.length === 0) {
      alert('No hay datos para descargar');
      return;
    }

    const datosExcel = this.datos.map((dato, index) => {
      const fila: any = {
        'O.S.': dato['O.S.'] || dato['OS'] || dato['O S'] || '',
        'Cl': dato['Cl'] || dato['CL'] || dato['cl'] || '',
        'Atleta': dato['Atleta'] || dato['Jinete'] || dato['NOMBRE JINETE'] || '',
        'Caballo': dato['Caballo'] || '',
        'Club': dato['Club'] || '',
        'Puntos': dato['Puntos'] || dato['Faltas'] || '',
        'Tiempo': dato['Tiempo'] || dato['TIempo'] || '',
      };

      // Añadir todas las columnas adicionales que puedan existir
      Object.keys(dato).forEach(key => {
        if (!fila[key] && !['O.S.', 'OS', 'O S', 'Cl', 'CL', 'cl', 'Atleta', 'Jinete', 'NOMBRE JINETE', 'Caballo', 'Club', 'Puntos', 'Faltas', 'Tiempo', 'TIempo'].includes(key)) {
          fila[key] = dato[key];
        }
      });

      return fila;
    });

    const ws = XLSX.utils.json_to_sheet(datosExcel);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Resultados');
    
    const nombreArchivo = `Resultados_${this.concursoSeleccionado}_${this.diaSeleccionado}_${this.categoriaSeleccionada}_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, nombreArchivo);
  }
}
