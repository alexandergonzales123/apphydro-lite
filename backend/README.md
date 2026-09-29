# Backend — App AR de Infraestructura (Lite)

FastAPI + PostGIS con Docker Compose. Contrato: `../CONTRACT.md`.

```
backend/
  docker-compose.yml     db (postgis/postgis:16-3.4), api (FastAPI), loader (GDAL, perfil "loader")
  db/init.sql            tablas activo / red (SRID 4326) + índices GiST
  api/                   Dockerfile, app/ (main.py, sql.py), tests/
  scripts/load.sh|ps1    carga con ogr2ogr (imagen Docker de GDAL; no hace falta ogr2ogr local)
  data/                  sensores.geojson (10 puntos), tuberias.geojson (4 tramos) en Lima
```

## 1. Levantar

```sh
cd backend
docker compose up -d --build
curl http://localhost:8000/health        # {"status":"ok"}
```

Variables (opcionales, vía entorno o fichero `.env` junto a docker-compose.yml):

| Variable | Por defecto | Uso |
|---|---|---|
| `API_KEY` | `dev-key-cambiar` | clave que se comprueba con la cabecera `X-API-Key` (cámbiala). Si está vacía o vale `dev-key-cambiar`, la API muestra un WARNING al arrancar |
| `ENV` | `development` | con `production` la API **no arranca** si `API_KEY` está vacía o es `dev-key-cambiar` |
| `ENABLE_DOCS` | `1` en compose | `1` expone `/docs`, `/redoc` y `/openapi.json`; con cualquier otro valor no existen (404) |
| `POSTGRES_DB` / `POSTGRES_USER` / `POSTGRES_PASSWORD` | `infra` | credenciales de la BD |
| `POSTGRES_HOST_PORT` | `5432` | puerto del host (sólo `127.0.0.1`) para Postgres; cámbialo si 5432 está ocupado |

Plantilla: `cp .env.example .env`. Postgres se publica sólo en `127.0.0.1:${POSTGRES_HOST_PORT}` (por defecto 5432; no accesible desde la red).

La API usa `DATABASE_URL` (la compone docker compose) y un pool asyncpg (`DB_POOL_MIN`=2, `DB_POOL_MAX`=10).

`db/init.sql` sólo se ejecuta cuando el volumen está vacío. Para recrear la BD: `docker compose down -v`.
Es idempotente, así que para aplicar cambios de esquema (p. ej. el trigger de `red.tipo`) sobre una BD ya creada:
`docker compose exec -T db psql -U infra -d infra < db/init.sql`.

## 2. Cargar datos

Bash / Git Bash:
```sh
./scripts/load.sh                                   # REEMPLAZA: TRUNCATE + carga de data/sensores.geojson y data/tuberias.geojson
./scripts/load.sh --append mas_activos.geojson mas_redes.geojson   # añade sin vaciar
S_SRS=EPSG:32718 ./scripts/load.sh mis_activos.shp mis_redes.shp   # origen en UTM 18S sin SRS declarado
```

PowerShell:
```powershell
.\scripts\load.ps1                                  # REEMPLAZA: TRUNCATE + carga
.\scripts\load.ps1 -Append -Activos mas_activos.geojson -Red mas_redes.geojson   # añade sin vaciar
.\scripts\load.ps1 -Activos mis_activos.shp -Red mis_redes.shp -SSrs EPSG:32718
```

Las rutas son relativas a `./data` (se monta en `/data` dentro del contenedor GDAL). Lo que hacen los scripts
es `docker compose --profile loader run --rm loader ogr2ogr -f PostgreSQL PG: /data/<fichero> -append -nln activo|red -nlt POINT|LINESTRING [-s_srs ...] -t_srs EPSG:4326 -sql "SELECT <columnas del contrato> FROM <capa>"`.

- El fichero de origen tiene que tener estas columnas:
  - activos: `codigo, tipo, estado, profundidad_m, atributos` (objeto JSON)
  - red: `codigo, tipo, diametro_mm, material, profundidad_m`, con `tipo` ∈ `agua | desagüe | gas | eléctrico`.
    Un trigger `BEFORE INSERT/UPDATE` normaliza `tipo` (minúsculas, sin espacios; `desague`/`Desagüe`/`DESAGUE` → `desagüe`,
    `electrico`/`Eléctrico` → `eléctrico`). Otros valores siguen fallando por el CHECK.
- Por defecto los scripts vacían las tablas antes de cargar (re-ejecutarlos no duplica filas). Con `--append` / `-Append` se añaden.
- El `id` lo genera la tabla. Con `-append`, ogr2ogr escribe en la columna `geom` que ya existe, y `-explodecollections` convierte los MultiLineString en LineString.
- El nombre de la capa por defecto es el del fichero sin extensión. Se puede cambiar con `ACTIVOS_LAYER` / `RED_LAYER` (sh) o `-ActivosLayer` / `-RedLayer` (ps1).
- `-s_srs` sólo hace falta cuando el fichero no declara su SRS. Si lo declara (por ejemplo, un .prj), ogr2ogr lo usa y reproyecta él solo.

## 3. Exponer por HTTPS para probar en iPhone

iOS exige HTTPS para peticiones desde la app (ATS), así que para probar en un iPhone real hay que publicar
`http://localhost:8000` con un túnel HTTPS:

- **Opción A: Cloudflare Tunnel (túnel rápido, sin cuenta)**
  ```sh
  cloudflared tunnel --url http://localhost:8000
  ```
  Imprime una URL del tipo `https://<algo>.trycloudflare.com`. Cambia en cada ejecución.
- **Opción B: ngrok** (requiere cuenta gratuita y `ngrok config add-authtoken <token>`)
  ```sh
  ngrok http 8000
  ```
  Usa la URL `https://....ngrok-free.app` de la línea `Forwarding`.

Pon la URL https resultante (sin barra final) en `EXPO_PUBLIC_API_URL` de la app, junto con `EXPO_PUBLIC_API_KEY` = `API_KEY`,
y reinicia Metro (`npx expo start -c`) para que se apliquen las variables. Mientras el túnel está abierto la API es pública:
usa una `API_KEY` propia (no `dev-key-cambiar`) y considera `ENABLE_DOCS=0`.

## 4. Probar

```sh
# 401
curl -i "http://localhost:8000/cercanos?lat=-12.0463&lon=-77.0301"
# 422
curl -i -H "X-API-Key: dev-key-cambiar" "http://localhost:8000/cercanos?lat=95&lon=-77.0301"
# 200 GeoJSON (application/geo+json)
curl -s -H "X-API-Key: dev-key-cambiar" "http://localhost:8000/cercanos?lat=-12.0463&lon=-77.0301&radio=50"
```

Con los datos de ejemplo y radio=50 salen 6 activos y 4 features de red: AG-220, DS-105 y GS-031. GS-031 tiene forma de U, así que la intersección da un MultiLineString y se emite como 2 LineString con el mismo `id`. EL-012 queda fuera del radio.

Tests (dentro del contenedor; el test de integración se ejecuta si la BD responde):
```sh
docker compose exec api pytest -q
```
En local (sin BD, el test de integración se salta): `cd api && pip install -r requirements-dev.txt && pytest -q`.

## Notas de implementación

- Todo se resuelve con una sola consulta SQL (`api/app/sql.py`) que devuelve directamente el FeatureCollection como texto JSON:
  - `ST_DWithin(geom::geography, punto::geography, radio)` usa los índices GiST de expresión `(geom::geography)`. Además hay GiST sobre `geom`, como pide el contrato.
  - Red: `ST_Intersection(geom, ST_Buffer(punto::geography, radio)::geometry)`, luego `ST_Dump` (una parte por Feature) y `ST_Segmentize(parte::geography, 1)` (un vértice como mucho cada 1 m).
  - `distancia_m` = `ST_Distance` en geography (metros, 2 decimales) hasta la geometría emitida.
  - Las features se ordenan así: primero activos y después red, cada grupo por distancia. Coordenadas con 7 decimales (~1 cm).
- Sin BD, `/cercanos` responde 503 y vuelve a intentar crear el pool en la siguiente petición. Si la BD cae con el pool ya creado,
  los errores de conexión (`OSError`, timeouts, `asyncpg.PostgresConnectionError`, `InterfaceError`, admin shutdown, etc.)
  también se traducen en 503 `{"detail":"Base de datos no disponible"}`.
- El contenedor arranca con `python -m app.serve`, que valida `API_KEY`/`ENV` una sola vez antes de lanzar uvicorn (2 workers).
