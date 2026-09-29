# Contrato API — App AR de Infraestructura (Lite)

Fuente: `Requisitos — App AR de Infraestructura (versión Lite).pdf`

## Estructura del repo
- `backend/`  — FastAPI + PostGIS (Docker Compose), script de carga, datos de ejemplo.
- `mobile/`   — Expo + React Native + ViroReact (iOS 17+, development build).

## Endpoint único
`GET /cercanos?lat=<float>&lon=<float>&radio=<float, default 50, max 200>`

Cabecera obligatoria: `X-API-Key: <clave>`

- 401 si falta o es incorrecta la API key: `{"detail": "API key inválida"}`
- 422 si lat/lon faltan o están fuera de rango (lat ∈ [-90,90], lon ∈ [-180,180], 0 < radio ≤ 200)
- 200: GeoJSON `FeatureCollection`, `Content-Type: application/geo+json` (o application/json)

`GET /health` → `{"status":"ok"}` (sin API key).

### Features
Activo (Point):
```json
{"type":"Feature","geometry":{"type":"Point","coordinates":[lon,lat]},
 "properties":{"capa":"activo","id":1,"codigo":"SEN-014","tipo":"sensor","estado":"activo",
               "profundidad_m":0.4,"atributos":{},"distancia_m":12.3}}
```
Tubería (LineString, recortada al radio con ST_Intersection y vértice cada 1 m con ST_Segmentize sobre geography):
```json
{"type":"Feature","geometry":{"type":"LineString","coordinates":[[lon,lat],...]},
 "properties":{"capa":"red","id":1,"codigo":"AG-220","tipo":"agua","diametro_mm":160,
               "material":"PVC","profundidad_m":1.2,"distancia_m":3.1}}
```
- `tipo` de red ∈ `agua | desagüe | gas | eléctrico`
- `distancia_m`: distancia en metros desde (lat,lon) al punto más cercano de la geometría.
- Si una intersección produce MultiLineString, se emite un Feature LineString por parte.
- Campos nulos se envían como `null`. Coordenadas siempre en orden `[lon, lat]` (WGS84, SRID 4326).
- `id` NO es único por feature: las partes de una tubería partida comparten `id` y `codigo`. El cliente usa claves estables `activo-{id}` y `red-{id}-{n}` (n = índice de la parte, orden determinista).
- Orden: primero activos y luego red, cada grupo ordenado por `distancia_m` (redondeada a 2 decimales).
- 503 `{"detail":"Base de datos no disponible"}` si la BD no responde; el cliente lo trata como sin conexión (usa caché).
- Validación: sin key → 401 aunque los parámetros también sean inválidos.

## Tablas (PostGIS, SRID 4326, índice GiST en geom)
- `activo(id, codigo, tipo, estado, profundidad_m, atributos jsonb, geom Point)`
- `red(id, codigo, tipo, diametro_mm, material, profundidad_m, geom LineString)`

## Configuración app
- `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_API_KEY` (API key fija en la app, RNF-L06).
- Convención de profundidad: `profundidad_m` positivo = metros bajo el suelo; `null` o ≤ 0 = en superficie.
- Dev: key `dev-key-cambiar`, URL `http://<IP LAN>:8000`. Producción debe ser HTTPS (ATS de iOS).
