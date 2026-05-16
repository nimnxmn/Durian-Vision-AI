from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient


def test_detect_demo_image(client: TestClient, demo_image_path: Path) -> None:
    if not demo_image_path.exists():
        pytest.skip(f"Demo image not available: {demo_image_path}")

    with demo_image_path.open("rb") as f:
        r = client.post(
            "/api/detect",
            files={"file": (demo_image_path.name, f, "image/jpeg")},
            data={"conf": "0.25", "iou": "0.5"},
        )

    assert r.status_code == 200, r.text
    body = r.json()
    assert body["count"] > 0
    assert len(body["detections"]) == body["count"]
    assert body["image_base64"]
    assert body["inference_ms"] > 0
    w, h = body["image_size"]
    assert w > 0 and h > 0

    # Spot-check one detection has the expected shape.
    first = body["detections"][0]
    assert {"id", "x", "y", "w", "h", "conf"} <= first.keys()
    assert 0 <= first["conf"] <= 1


def test_detect_rejects_non_image(client: TestClient) -> None:
    r = client.post(
        "/api/detect",
        files={"file": ("not-an-image.txt", b"hello", "text/plain")},
    )
    assert r.status_code == 415


def test_detect_rejects_bad_conf(client: TestClient, demo_image_path: Path) -> None:
    if not demo_image_path.exists():
        pytest.skip(f"Demo image not available: {demo_image_path}")
    with demo_image_path.open("rb") as f:
        r = client.post(
            "/api/detect",
            files={"file": (demo_image_path.name, f, "image/jpeg")},
            data={"conf": "1.5", "iou": "0.5"},
        )
    assert r.status_code == 422
