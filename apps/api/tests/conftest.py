from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from apps.api.main import app


@pytest.fixture(scope="session")
def client() -> TestClient:
    # TestClient triggers the lifespan, which warms the model.
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="session")
def demo_image_path() -> Path:
    root = Path(__file__).resolve().parents[3]
    return root / "demo-image" / "demo.jpg"
