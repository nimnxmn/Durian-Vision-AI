from __future__ import annotations

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from PIL import UnidentifiedImageError

from apps.api.config import ALLOWED_CONTENT_TYPES, DEFAULT_CONF, DEFAULT_IOU, MAX_UPLOAD_BYTES
from apps.api.schemas import DetectResponse
from apps.api.services.inference import run_detection

router = APIRouter()


@router.post("/api/detect", response_model=DetectResponse)
async def detect(
    file: UploadFile = File(...),
    conf: float = Form(DEFAULT_CONF),
    iou: float = Form(DEFAULT_IOU),
) -> DetectResponse:
    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported file type: {file.content_type}. Use JPEG or PNG.",
        )

    data = await file.read()
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File too large: {len(data)} bytes (max {MAX_UPLOAD_BYTES}).",
        )

    if not (0.0 < conf <= 1.0) or not (0.0 < iou <= 1.0):
        raise HTTPException(status_code=422, detail="conf and iou must be in (0, 1].")

    try:
        return run_detection(data, conf=conf, iou=iou)
    except UnidentifiedImageError:
        raise HTTPException(status_code=415, detail="Could not decode image.")
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
