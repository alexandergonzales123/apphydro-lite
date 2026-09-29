"""Punto de entrada del contenedor: valida la configuración una vez y lanza uvicorn.

Si la configuración es insegura en producción, sale con código 1 antes de crear workers
(evita que uvicorn reinicie workers en bucle).
"""
import logging
import os
import sys

import uvicorn

from .settings import InsecureConfigError, check_api_key


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s:     %(name)s - %(message)s")
    try:
        check_api_key()
    except InsecureConfigError:
        sys.exit(1)
    os.environ["_API_CONFIG_CHECKED"] = "1"  # los workers no repiten el aviso
    uvicorn.run(
        "app.main:app",
        host=os.environ.get("HOST", "0.0.0.0"),
        port=int(os.environ.get("PORT", "8000")),
        workers=int(os.environ.get("WEB_WORKERS", "2")),
    )


if __name__ == "__main__":
    main()
