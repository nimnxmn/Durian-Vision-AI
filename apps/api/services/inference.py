from __future__ import annotations

import base64
import io
import time

import numpy as np
from PIL import Image, ImageDraw

from apps.api.config import MAX_LONG_EDGE
from apps.api.schemas import Detection, DetectResponse
from apps.api.services.model import get_model


def _resize_long_edge(image: Image.Image, max_edge: int) -> Image.Image:
    w, h = image.size
    long_edge = max(w, h)
    if long_edge <= max_edge:
        return image
    scale = max_edge / long_edge
    return image.resize((int(w * scale), int(h * scale)), Image.LANCZOS)


def run_detection(image_bytes: bytes, conf: float, iou: float) -> DetectResponse:
    image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    image = _resize_long_edge(image, MAX_LONG_EDGE)
    width, height = image.size

    model = get_model()
    start = time.perf_counter()
    results = model.predict(image, conf=conf, iou=iou, verbose=False)
    inference_ms = (time.perf_counter() - start) * 1000.0

    result = results[0]
    boxes = result.boxes

    detections: list[Detection] = []
    if boxes is not None and len(boxes) > 0:
        xywh = boxes.xywh.cpu().numpy()
        confs = boxes.conf.cpu().numpy()
        for i, (box, c) in enumerate(zip(xywh, confs)):
            cx, cy, bw, bh = box
            detections.append(
                Detection(
                    id=i,
                    x=int(cx - bw / 2),
                    y=int(cy - bh / 2),
                    w=int(bw),
                    h=int(bh),
                    conf=float(c),
                )
            )

    annotated = image.copy()
    draw = ImageDraw.Draw(annotated)
    lw = max(2, int(max(image.size) / 320))
    for d in detections:
        draw.rectangle(
            [d.x, d.y, d.x + d.w, d.y + d.h],
            outline=(250, 204, 21),
            width=lw,
        )
    buf = io.BytesIO()
    annotated.save(buf, format="PNG")
    image_b64 = "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode("ascii")

    return DetectResponse(
        count=len(detections),
        detections=detections,
        image_base64=image_b64,
        inference_ms=round(inference_ms, 2),
        image_size=(width, height),
    )
