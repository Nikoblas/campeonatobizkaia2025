const fs = require('fs');
const path = require('path');

// Leer el archivo de versión
const versionPath = path.join(__dirname, '..', 'version.json');
const versionFile = JSON.parse(fs.readFileSync(versionPath, 'utf8'));

// Incrementar la versión
const [major, minor, patch] = versionFile.version.split('.');
versionFile.version = `${major}.${minor}.${parseInt(patch) + 1}`;

// Guardar el archivo de versión actualizado
fs.writeFileSync(versionPath, JSON.stringify(versionFile, null, 2));

// Actualizar la versión en el componente
const appComponentPath = path.join(__dirname, '..', 'src', 'app', 'app.component.html');
let appComponent = fs.readFileSync(appComponentPath, 'utf8');
appComponent = appComponent.replace(
  /<span>v\d+\.\d+\.\d+<\/span>/,
  `<span>v${versionFile.version}</span>`
);
fs.writeFileSync(appComponentPath, appComponent);
