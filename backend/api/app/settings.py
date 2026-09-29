"""Comprobaciones de configuración al arrancar (API_KEY, docs)."""
import logging
import os

log = logging.getLogger("api")

DEV_API_KEY = "dev-key-cambiar"


class InsecureConfigError(RuntimeError):
    pass


def docs_enabled() -> bool:
    """/docs, /redoc y /openapi.json sólo si ENABLE_DOCS=1."""
    return os.environ.get("ENABLE_DOCS", "").strip() == "1"


def check_api_key() -> None:
    """WARNING si API_KEY es la de desarrollo o está vacía; error si además ENV=production."""
    key = os.environ.get("API_KEY", "").strip()
    if key and key != DEV_API_KEY:
        return
    motivo = "vacía" if not key else f"'{DEV_API_KEY}' (valor por defecto)"
    if os.environ.get("ENV", "").strip().lower() == "production":
        msg = f"API_KEY {motivo} con ENV=production: la API se niega a arrancar. Define una API_KEY segura."
        log.critical(msg)
        raise InsecureConfigError(msg)
    banner = "!" * 78
    log.warning(
        "\n%s\n!! ATENCION: API_KEY %s. Solo aceptable en desarrollo.\n"
        "!! Define API_KEY en .env antes de exponer la API.\n%s",
        banner, motivo, banner,
    )
