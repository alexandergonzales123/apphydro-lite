"""503 con el pool ya creado cuando la BD cae, y comprobaciones de configuración."""
import asyncio

import asyncpg
import pytest
from fastapi.testclient import TestClient

from app import settings
from app.main import app

LAT, LON = -12.0463, -77.0301
client = TestClient(app)

ERRORES_BD = [
    ConnectionRefusedError(111, "Connection refused"),
    OSError(113, "No route to host"),
    asyncio.TimeoutError(),
    asyncpg.PostgresConnectionError("conexión perdida"),
    asyncpg.ConnectionDoesNotExistError("connection was closed in the middle of operation"),
    asyncpg.InterfaceError("pool is closing"),
    asyncpg.exceptions.AdminShutdownError("terminating connection due to administrator command"),
    asyncpg.exceptions.CannotConnectNowError("the database system is starting up"),
    asyncpg.exceptions.TooManyConnectionsError("too many clients"),
]


class _Acquire:
    def __init__(self, exc_acquire=None, exc_query=None):
        self.exc_acquire, self.exc_query = exc_acquire, exc_query

    async def __aenter__(self):
        if self.exc_acquire is not None:
            raise self.exc_acquire
        exc = self.exc_query

        class _Conn:
            async def fetchval(self, *a, **k):
                raise exc

        return _Conn()

    async def __aexit__(self, *a):
        return False


class FakePool:
    def __init__(self, **kw):
        self.kw = kw

    def acquire(self):
        return _Acquire(**self.kw)


def _get(api_key):
    return client.get("/cercanos", params={"lat": LAT, "lon": LON},
                      headers={"X-API-Key": api_key})


@pytest.mark.parametrize("exc", ERRORES_BD, ids=lambda e: type(e).__name__)
def test_503_si_falla_acquire(api_key, monkeypatch, exc):
    monkeypatch.setattr(app.state, "pool", FakePool(exc_acquire=exc), raising=False)
    r = _get(api_key)
    assert r.status_code == 503
    assert r.json() == {"detail": "Base de datos no disponible"}


@pytest.mark.parametrize("exc", ERRORES_BD, ids=lambda e: type(e).__name__)
def test_503_si_falla_consulta(api_key, monkeypatch, exc):
    monkeypatch.setattr(app.state, "pool", FakePool(exc_query=exc), raising=False)
    r = _get(api_key)
    assert r.status_code == 503
    assert r.json() == {"detail": "Base de datos no disponible"}


def test_error_sql_no_se_disfraza_de_503(api_key, monkeypatch):
    # Un error de programación/SQL no es "BD caída": no debe convertirse en 503.
    monkeypatch.setattr(app.state, "pool",
                        FakePool(exc_query=asyncpg.UndefinedTableError("no existe")), raising=False)
    c = TestClient(app, raise_server_exceptions=False)
    r = c.get("/cercanos", params={"lat": LAT, "lon": LON}, headers={"X-API-Key": api_key})
    assert r.status_code == 500


# ------------------------------------------------------------- configuración
@pytest.mark.parametrize("valor,esperado", [("1", True), ("", False), ("0", False), ("true", False)])
def test_docs_enabled(monkeypatch, valor, esperado):
    monkeypatch.setenv("ENABLE_DOCS", valor)
    assert settings.docs_enabled() is esperado


@pytest.mark.parametrize("key", ["", "dev-key-cambiar"])
def test_api_key_insegura_warning_en_dev(monkeypatch, caplog, key):
    monkeypatch.setenv("API_KEY", key)
    monkeypatch.delenv("ENV", raising=False)
    with caplog.at_level("WARNING", logger="api"):
        settings.check_api_key()
    assert "API_KEY" in caplog.text


@pytest.mark.parametrize("key", ["", "dev-key-cambiar"])
def test_api_key_insegura_en_produccion_no_arranca(monkeypatch, key):
    monkeypatch.setenv("API_KEY", key)
    monkeypatch.setenv("ENV", "production")
    with pytest.raises(settings.InsecureConfigError):
        settings.check_api_key()


def test_api_key_segura_en_produccion(monkeypatch, caplog):
    monkeypatch.setenv("API_KEY", "una-clave-larga-y-aleatoria")
    monkeypatch.setenv("ENV", "production")
    with caplog.at_level("WARNING", logger="api"):
        settings.check_api_key()
    assert caplog.text == ""
