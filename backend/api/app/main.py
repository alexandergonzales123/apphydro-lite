import asyncio
import logging
import os
import secrets
from contextlib import asynccontextmanager

import asyncpg
from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

from .settings import check_api_key, docs_enabled
from .sql import CERCANOS_SQL

log = logging.getLogger("api")

RADIO_DEFAULT = 50.0
RADIO_MAX = 200.0

# Errores que indican BD caída / inaccesible (-> 503 en lugar de 500).
DB_UNAVAILABLE_ERRORS: tuple[type[BaseException], ...] = (
    OSError,                                    # ConnectionRefusedError, socket, TimeoutError...
    asyncio.TimeoutError,                       # timeout de acquire / command_timeout
    asyncpg.PostgresConnectionError,            # clase 08 (conexión)
    asyncpg.InterfaceError,                     # ConnectionDoesNotExistError, pool cerrado...
    asyncpg.exceptions.OperatorInterventionError,   # 57P01 admin_shutdown, 57P03 cannot_connect_now
    asyncpg.exceptions.InsufficientResourcesError,  # 53300 too_many_connections
)


_pool_lock = asyncio.Lock()


async def get_pool(app: FastAPI) -> asyncpg.Pool | None:
    """Devuelve el pool; si aún no existe (BD caída al arrancar) lo intenta crear."""
    if getattr(app.state, "pool", None) is not None:
        return app.state.pool
    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        return None
    async with _pool_lock:
        if getattr(app.state, "pool", None) is None:
            try:
                app.state.pool = await asyncpg.create_pool(
                    dsn,
                    min_size=int(os.environ.get("DB_POOL_MIN", "2")),
                    max_size=int(os.environ.get("DB_POOL_MAX", "10")),
                    command_timeout=5,
                    timeout=3,
                )
            except Exception:  # /cercanos responderá 503 y se reintentará
                log.exception("No se pudo crear el pool de BD")
    return app.state.pool


@asynccontextmanager
async def lifespan(app: FastAPI):
    if os.environ.get("_API_CONFIG_CHECKED") != "1":  # uvicorn lanzado sin app.serve
        check_api_key()
    app.state.pool = None
    await get_pool(app)
    try:
        yield
    finally:
        if app.state.pool is not None:
            await app.state.pool.close()


_docs = docs_enabled()
app = FastAPI(
    title="App AR de Infraestructura (Lite)",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs" if _docs else None,
    redoc_url="/redoc" if _docs else None,
    openapi_url="/openapi.json" if _docs else None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "OPTIONS"],
    allow_headers=["*"],
)


def require_api_key(x_api_key: str | None = Header(default=None, alias="X-API-Key")) -> None:
    expected = os.environ.get("API_KEY", "")
    if not expected or not x_api_key or not secrets.compare_digest(
        x_api_key.encode("utf-8"), expected.encode("utf-8")
    ):
        raise HTTPException(status_code=401, detail="API key inválida")


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}


@app.get("/cercanos", dependencies=[Depends(require_api_key)])
async def cercanos(
    request: Request,
    lat: float = Query(..., ge=-90, le=90, allow_inf_nan=False),
    lon: float = Query(..., ge=-180, le=180, allow_inf_nan=False),
    radio: float = Query(RADIO_DEFAULT, gt=0, le=RADIO_MAX, allow_inf_nan=False),
) -> Response:
    pool = await get_pool(request.app)
    if pool is None:
        raise HTTPException(status_code=503, detail="Base de datos no disponible")
    try:
        async with pool.acquire() as conn:
            body = await conn.fetchval(CERCANOS_SQL, lon, lat, radio)
    except DB_UNAVAILABLE_ERRORS as exc:
        log.warning("BD no disponible: %s: %s", type(exc).__name__, exc)
        raise HTTPException(status_code=503, detail="Base de datos no disponible") from None
    return Response(content=body, media_type="application/geo+json")
