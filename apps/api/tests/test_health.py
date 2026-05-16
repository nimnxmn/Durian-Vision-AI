from fastapi.testclient import TestClient


def test_health_ok(client: TestClient) -> None:
    r = client.get("/api/health")
    assert r.status_code == 200
    body = r.json()
    assert body["model_loaded"] is True
    assert "best.pt" in body["model_path"]
    assert body["error"] is None
