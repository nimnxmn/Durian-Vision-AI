from __future__ import annotations

import numpy as np

from apps.api.config import MODEL_PATH

_model = None
_load_error: str | None = None


def get_model():
    global _model, _load_error
    if _model is not None:
        return _model

    if not MODEL_PATH.exists():
        _load_error = f"Model weights not found at {MODEL_PATH}"
        raise FileNotFoundError(_load_error)

    from ultralytics import YOLO

    _model = YOLO(str(MODEL_PATH))
    return _model


def warmup() -> None:
    try:
        model = get_model()
        dummy = np.zeros((640, 640, 3), dtype=np.uint8)
        model.predict(dummy, verbose=False)
    except Exception as exc:
        global _load_error
        _load_error = str(exc)


def model_status() -> tuple[bool, str | None]:
    return _model is not None, _load_error
