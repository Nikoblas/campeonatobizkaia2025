const fs = require('fs');
const path = require('path');

const baseDir = path.join(__dirname, 'src', 'assets', 'data');
if (!fs.existsSync(baseDir)) {
  console.error('No existe la carpeta src/assets/data');
  process.exit(1);
}
const concursos = fs.readdirSync(baseDir).filter(f => fs.statSync(path.join(baseDir, f)).isDirectory());

const resultado = {};

for (const concurso of concursos) {
  const dir = path.join(baseDir, concurso);
  const archivos = fs.readdirSync(dir).filter(f => f.endsWith('.xlsx') || f.endsWith('.xls'));
  resultado[concurso] = archivos;
}

fs.writeFileSync(
  path.join(baseDir, 'listado-archivos.json'),
  JSON.stringify(resultado, null, 2),
  'utf-8'
);
