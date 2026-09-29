-- Esquema App AR de Infraestructura (Lite). SRID 4326.
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS activo (
    id            SERIAL PRIMARY KEY,
    codigo        TEXT NOT NULL,
    tipo          TEXT,
    estado        TEXT,
    profundidad_m DOUBLE PRECISION,
    atributos     JSONB NOT NULL DEFAULT '{}'::jsonb,
    geom          geometry(Point, 4326) NOT NULL
);

CREATE TABLE IF NOT EXISTS red (
    id            SERIAL PRIMARY KEY,
    codigo        TEXT NOT NULL,
    tipo          TEXT CHECK (tipo IN ('agua', 'desagüe', 'gas', 'eléctrico')),
    diametro_mm   DOUBLE PRECISION,
    material      TEXT,
    profundidad_m DOUBLE PRECISION,
    geom          geometry(LineString, 4326) NOT NULL
);

-- Índice GiST sobre geometry (contrato) ...
CREATE INDEX IF NOT EXISTS activo_geom_gist ON activo USING GIST (geom);
CREATE INDEX IF NOT EXISTS red_geom_gist    ON red    USING GIST (geom);
-- ... y sobre la expresión geography, para que ST_DWithin(geom::geography, ...) use índice.
CREATE INDEX IF NOT EXISTS activo_geog_gist ON activo USING GIST ((geom::geography));
CREATE INDEX IF NOT EXISTS red_geog_gist    ON red    USING GIST ((geom::geography));

-- Normaliza red.tipo antes del CHECK: minúsculas, sin espacios y formas sin tilde
-- -> formas del contrato ('Desagüe', 'DESAGUE', 'desague' -> 'desagüe'; 'Electrico' -> 'eléctrico').
-- Idempotente: se puede ejecutar también sobre una BD ya creada.
CREATE OR REPLACE FUNCTION red_normaliza_tipo() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    t TEXT;
BEGIN
    IF NEW.tipo IS NOT NULL THEN
        t := NULLIF(lower(translate(btrim(NEW.tipo), 'ÜÉ', 'üé')), '');
        NEW.tipo := CASE t
            WHEN 'desague'   THEN 'desagüe'
            WHEN 'electrico' THEN 'eléctrico'
            ELSE t
        END;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS red_normaliza_tipo ON red;
CREATE TRIGGER red_normaliza_tipo
    BEFORE INSERT OR UPDATE OF tipo ON red
    FOR EACH ROW EXECUTE FUNCTION red_normaliza_tipo();
