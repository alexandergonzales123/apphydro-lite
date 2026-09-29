"""Tests unitarios (sin BD) e integración (si DATABASE_URL es accesible)."""
import asyncio
import os

import pytest
from fastapi.testclient import TestClient

from app.main import app

LAT, LON = -12.0463, -77.0301

# Sin context manager: no se ejecuta el lifespan, así que no hace falta BD.
client = TestClient(app)


def test_health():
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


def test_401_sin_key():
    r = client.get("/cercanos", params={"lat": LAT, "lon": LON})
    assert r.status_code == 401
    assert r.json() == {"detail": "API key inválida"}


def test_401_key_incorrecta():
    r = client.get("/cercanos", params={"lat": LAT, "lon": LON}, headers={"X-API-Key": "mala"})
    assert r.status_code == 401
    assert r.json() == {"detail": "API key inválida"}


@pytest.mark.parametrize(
    "params",
    [
        {"lon": LON},                                   # falta lat
        {"lat": LAT},                                   # falta lon
        {"lat": 91, "lon": LON},
        {"lat": -90.0001, "lon": LON},
        {"lat": LAT, "lon": 180.5},
        {"lat": LAT, "lon": -181},
        {"lat": LAT, "lon": LON, "radio": 0},
        {"lat": LAT, "lon": LON, "radio": -5},
        {"lat": LAT, "lon": LON, "radio": 200.1},
        {"lat": "abc", "lon": LON},
        {"lat": "nan", "lon": LON},
        {"lat": LAT, "lon": LON, "radio": "inf"},
    ],
)
def test_422_parametros_invalidos(api_key, params):
    r = client.get("/cercanos", params=params, headers={"X-API-Key": api_key})
    assert r.status_code == 422, r.text


def test_503_sin_bd(api_key, monkeypatch):
    # Parámetros válidos pero sin BD configurada -> 503 (no 500)
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.setattr(app.state, "pool", None, raising=False)
    r = client.get("/cercanos", params={"lat": LAT, "lon": LON, "radio": 200},
                   headers={"X-API-Key": api_key})
    assert r.status_code == 503


def test_cors_preflight():
    r = client.options(
        "/cercanos",
        headers={"Origin": "http://example.com", "Access-Control-Request-Method": "GET",
                 "Access-Control-Request-Headers": "X-API-Key"},
    )
    assert r.status_code == 200
    assert r.headers.get("access-control-allow-origin") in ("*", "http://example.com")


# ---------------------------------------------------------------- integración
def _db_disponible() -> bool:
    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        return False
    import asyncpg

    async def ping():
        conn = await asyncpg.connect(dsn, timeout=2)
        try:
            return await conn.fetchval("SELECT count(*) FROM activo") is not None
        finally:
            await conn.close()

    try:
        return asyncio.run(ping())
    except Exception:
        return False


@pytest.mark.skipif(not _db_disponible(), reason="BD no disponible (DATABASE_URL)")
def test_integracion_cercanos(api_key):
    with TestClient(app) as c:
        r = c.get("/cercanos", params={"lat": LAT, "lon": LON, "radio": 50},
                  headers={"X-API-Key": api_key})
    assert r.status_code == 200, r.text
    assert r.headers["content-type"].startswith("application/geo+json")
    fc = r.json()
    assert fc["type"] == "FeatureCollection"
    assert isinstance(fc["features"], list)
    for f in fc["features"]:
        assert f["type"] == "Feature"
        props = f["properties"]
        assert props["capa"] in ("activo", "red")
        assert 0 <= props["distancia_m"] <= 50.5
        if props["capa"] == "activo":
            assert f["geometry"]["type"] == "Point"
            assert set(props) == {"capa", "id", "codigo", "tipo", "estado",
                                  "profundidad_m", "atributos", "distancia_m"}
            assert isinstance(props["atributos"], dict)
            lon, lat = f["geometry"]["coordinates"]
            assert -78 < lon < -76 and -13 < lat < -11  # orden [lon, lat]
        else:
            assert f["geometry"]["type"] == "LineString"
            assert set(props) == {"capa", "id", "codigo", "tipo", "diametro_mm",
                                  "material", "profundidad_m", "distancia_m"}
            assert props["tipo"] in ("agua", "desagüe", "gas", "eléctrico")
            coords = f["geometry"]["coordinates"]
            assert len(coords) >= 2
