"""Consulta única de /cercanos. Parámetros: $1 lon, $2 lat, $3 radio (m).

- ST_DWithin sobre geography -> usa los índices GiST de expresión (geom::geography).
- Red: ST_Intersection con el buffer geográfico del radio, ST_Dump para separar
  MultiLineString en partes, y ST_Segmentize(geography, 1) -> vértice cada 1 m.
- distancia_m: ST_Distance geography (metros) al punto más cercano de la
  geometría emitida.
"""

CERCANOS_SQL = """
WITH
activos AS (
    SELECT
        ST_Distance(a.geom::geography,
                    ST_SetSRID(ST_MakePoint($1::float8, $2::float8), 4326)::geography) AS d,
        a.*
    FROM activo a
    WHERE ST_DWithin(a.geom::geography,
                     ST_SetSRID(ST_MakePoint($1::float8, $2::float8), 4326)::geography,
                     $3::float8)
),
red_partes AS (
    SELECT r.id, r.codigo, r.tipo, r.diametro_mm, r.material, r.profundidad_m,
           (ST_Dump(ST_Intersection(
                r.geom,
                ST_Buffer(ST_SetSRID(ST_MakePoint($1::float8, $2::float8), 4326)::geography,
                          $3::float8, 'quad_segs=32')::geometry
           ))).geom AS parte
    FROM red r
    WHERE ST_DWithin(r.geom::geography,
                     ST_SetSRID(ST_MakePoint($1::float8, $2::float8), 4326)::geography,
                     $3::float8)
),
red_f AS (
    SELECT
        ST_Distance(p.parte::geography,
                    ST_SetSRID(ST_MakePoint($1::float8, $2::float8), 4326)::geography) AS d,
        ST_Segmentize(p.parte::geography, 1)::geometry AS geom_seg,
        p.*
    FROM red_partes p
    WHERE ST_GeometryType(p.parte) = 'ST_LineString' AND NOT ST_IsEmpty(p.parte)
),
features AS (
    SELECT 0 AS orden, d, json_build_object(
        'type', 'Feature',
        'geometry', ST_AsGeoJSON(geom, 7)::json,
        'properties', json_build_object(
            'capa', 'activo',
            'id', id,
            'codigo', codigo,
            'tipo', tipo,
            'estado', estado,
            'profundidad_m', profundidad_m,
            'atributos', COALESCE(atributos, '{}'::jsonb),
            'distancia_m', round(d::numeric, 2)
        )
    ) AS f
    FROM activos
    UNION ALL
    SELECT 1 AS orden, d, json_build_object(
        'type', 'Feature',
        'geometry', ST_AsGeoJSON(geom_seg, 7)::json,
        'properties', json_build_object(
            'capa', 'red',
            'id', id,
            'codigo', codigo,
            'tipo', tipo,
            'diametro_mm', diametro_mm,
            'material', material,
            'profundidad_m', profundidad_m,
            'distancia_m', round(d::numeric, 2)
        )
    ) AS f
    FROM red_f
)
SELECT json_build_object(
    'type', 'FeatureCollection',
    'features', COALESCE(json_agg(f ORDER BY orden, d), '[]'::json)
)::text
FROM features
"""
