# Carga GeoJSON/Shapefile/GPKG en las tablas existentes `activo` y `red` con ogr2ogr
# (imagen Docker de GDAL, servicio `loader` de docker compose).
#
# Uso:  .\scripts\load.ps1 [-Append] [-Activos sensores.geojson] [-Red tuberias.geojson] [-SSrs EPSG:32718]
#   Por defecto REEMPLAZA: TRUNCATE ... RESTART IDENTITY y carga (re-ejecutable sin duplicar).
#   -Append: no vacía las tablas; añade las filas a las existentes.
#   (-Reset se acepta por compatibilidad; es el comportamiento por defecto.)
#   Rutas relativas a .\data. -SSrs: SRS de origen si el fichero no lo declara (p. ej. UTM 18S).
#   -ActivosLayer / -RedLayer: capa de origen (por defecto, nombre del fichero sin extensión).
#
# Mapeo de columnas: -sql selecciona sólo las columnas del contrato (el id lo genera
# la tabla). Con -append ogr2ogr escribe en la columna geométrica existente (`geom`);
# -nlt fuerza POINT/LINESTRING y -explodecollections separa MultiLineString.
param(
    [string]$Activos = "sensores.geojson",
    [string]$Red = "tuberias.geojson",
    [string]$SSrs = $env:S_SRS,
    [string]$ActivosLayer = "",
    [string]$RedLayer = "",
    [switch]$Append,
    [switch]$Reset  # obsoleto: el reemplazo ya es el comportamiento por defecto
)
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

function Invoke-Loader {
    docker compose --profile loader run --rm -T loader @args
    if ($LASTEXITCODE -ne 0) { throw "Fallo en: $args" }
}

if (-not $ActivosLayer) { $ActivosLayer = [IO.Path]::GetFileNameWithoutExtension($Activos) }
if (-not $RedLayer) { $RedLayer = [IO.Path]::GetFileNameWithoutExtension($Red) }

$srs = @()
if ($SSrs) { $srs = @("-s_srs", $SSrs) }

# Comillas dobles alrededor del nombre de capa dentro de -sql (nombres con espacios,
# guiones o mayúsculas). Windows PowerShell 5.1 (y 7.x en modo Legacy) no escapa las
# comillas internas al llamar a ejecutables nativos: hay que pasarlas como \".
$legacyArgs = ($PSVersionTable.PSVersion -lt [version]"7.3") -or
    ((Get-Variable PSNativeCommandArgumentPassing -ValueOnly -ErrorAction SilentlyContinue) -eq "Legacy")
$q = if ($legacyArgs) { '\"' } else { '"' }

if (-not $Append) {
    Write-Host ">> TRUNCATE activo, red (usa -Append para añadir sin vaciar)"
    Invoke-Loader ogrinfo PG: -sql "TRUNCATE activo, red RESTART IDENTITY" | Out-Null
}

Write-Host ">> activo <- data/$Activos"
Invoke-Loader ogr2ogr -f PostgreSQL PG: "/data/$Activos" `
    -append -nln activo -nlt POINT @srs -t_srs EPSG:4326 `
    -sql "SELECT codigo, tipo, estado, profundidad_m, atributos FROM $q$ActivosLayer$q"

Write-Host ">> red <- data/$Red"
Invoke-Loader ogr2ogr -f PostgreSQL PG: "/data/$Red" `
    -append -nln red -nlt LINESTRING -explodecollections @srs -t_srs EPSG:4326 `
    -sql "SELECT codigo, tipo, diametro_mm, material, profundidad_m FROM $q$RedLayer$q"

Invoke-Loader ogrinfo PG: -q -sql "SELECT (SELECT count(*) FROM activo) AS activos, (SELECT count(*) FROM red) AS tramos"
