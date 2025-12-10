# Verificar si estamos en la rama main
$currentBranch = git rev-parse --abbrev-ref HEAD
if ($currentBranch -eq "main") {
    # Leer el archivo de versión
    $versionPath = Join-Path $PSScriptRoot ".." "version.json"
    $versionContent = Get-Content $versionPath -Raw | ConvertFrom-Json

    # Incrementar la versión
    $versionParts = $versionContent.version -split '.'
    $versionContent.version = "$($versionParts[0]).$($versionParts[1]).$([int]$versionParts[2] + 1)"

    # Guardar el archivo de versión actualizado
    $versionContent | ConvertTo-Json | Set-Content $versionPath

    # Actualizar la versión en el componente
    $appComponentPath = Join-Path $PSScriptRoot ".." "src" "app" "app.component.html"
    $appComponent = Get-Content $appComponentPath -Raw
    $appComponent = $appComponent -replace '<span>v\d+\.\d+\.\d+</span>', "<span>v$($versionContent.version)</span>"
    Set-Content $appComponentPath $appComponent

    Write-Host "Versión actualizada a $($versionContent.version)"
} 