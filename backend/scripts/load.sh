#!/usr/bin/env sh
# Carga GeoJSON/Shapefile/GPKG en las tablas existentes `activo` y `red` con ogr2ogr
# (imagen Docker de GDAL, servicio `loader` de docker compose).
#
# Uso:  ./scripts/load.sh [--append] [ACTIVOS] [RED]
#   ACTIVOS   ruta relativa a ./data (por defecto sensores.geojson)
#   RED       ruta relativa a ./data (por defecto tuberias.geojson)
#   Por defecto REEMPLAZA: vacía las tablas (TRUNCATE ... RESTART IDENTITY) y carga,
#   así que se puede re-ejecutar sin duplicar filas.
#   --append  no vacía las tablas; añade las filas a las existentes.
#   (--reset se acepta por compatibilidad; es el comportamiento por defecto.)
# Variables:
#   S_SRS         SRS de origen si el fichero no lo declara, p. ej. S_SRS=EPSG:32718 (UTM 18S)
#   ACTIVOS_LAYER / RED_LAYER  nombre de la capa de origen (por defecto, nombre del fichero
#                 sin extensión; en GeoJSON coincide con el miembro "name" si existe)
#
# Mapeo de columnas: -sql selecciona sólo las columnas del contrato (el id lo genera
# la tabla). Con -append ogr2ogr escribe en la columna geométrica existente (`geom`)
# de la tabla creada por db/init.sql; -nlt fuerza POINT/LINESTRING y
# -explodecollections separa MultiLineString de origen en varios LineString.
set -eu
cd "$(dirname "$0")/.."

RESET=1
while [ $# -gt 0 ]; do
  case "$1" in
    --append) RESET=0; shift ;;
    --reset)  RESET=1; shift ;;
    --) shift; break ;;
    -*) echo "Opción desconocida: $1" >&2; exit 2 ;;
    *) break ;;
  esac
done
ACTIVOS="${1:-sensores.geojson}"
RED="${2:-tuberias.geojson}"
S_SRS="${S_SRS:-}"
base() { b=$(basename "$1"); echo "${b%.*}"; }
ACTIVOS_LAYER="${ACTIVOS_LAYER:-$(base "$ACTIVOS")}"
RED_LAYER="${RED_LAYER:-$(base "$RED")}"

# MSYS/Git Bash: no convertir rutas /data/... a rutas Windows
export MSYS_NO_PATHCONV=1

run() { docker compose --profile loader run --rm -T loader "$@"; }

SRS_ARGS=""
[ -n "$S_SRS" ] && SRS_ARGS="-s_srs $S_SRS"

if [ "$RESET" = "1" ]; then
  echo ">> TRUNCATE activo, red (usa --append para añadir sin vaciar)"
  run ogrinfo PG: -sql "TRUNCATE activo, red RESTART IDENTITY" >/dev/null
fi

echo ">> activo <- data/$ACTIVOS"
# shellcheck disable=SC2086
run ogr2ogr -f PostgreSQL PG: "/data/$ACTIVOS" \
  -append -nln activo -nlt POINT $SRS_ARGS -t_srs EPSG:4326 \
  -sql "SELECT codigo, tipo, estado, profundidad_m, atributos FROM \"$ACTIVOS_LAYER\""

echo ">> red <- data/$RED"
# shellcheck disable=SC2086
run ogr2ogr -f PostgreSQL PG: "/data/$RED" \
  -append -nln red -nlt LINESTRING -explodecollections $SRS_ARGS -t_srs EPSG:4326 \
  -sql "SELECT codigo, tipo, diametro_mm, material, profundidad_m FROM \"$RED_LAYER\""

run ogrinfo PG: -sql "SELECT (SELECT count(*) FROM activo) AS activos, (SELECT count(*) FROM red) AS tramos" -q
