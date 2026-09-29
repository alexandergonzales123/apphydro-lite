import os

import pytest

os.environ.setdefault("API_KEY", "test-key")


@pytest.fixture
def api_key() -> str:
    return os.environ["API_KEY"]
