from pydantic import BaseModel


class Detection(BaseModel):
    id: int
    x: int
    y: int
    w: int
    h: int
    conf: float


class DetectResponse(BaseModel):
    count: int
    detections: list[Detection]
    image_base64: str
    inference_ms: float
    image_size: tuple[int, int]


class HealthResponse(BaseModel):
    model_loaded: bool
    model_path: str
    error: str | None = None
