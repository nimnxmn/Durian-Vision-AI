# Phase 1 — A Complete Walkthrough

A student-friendly tour of the FastAPI backend we just built. Read top to bottom.

---

## Part 1: What is a "backend" actually?

A web server is a program that **never finishes running**. It sits there, waiting. When someone (a browser, a curl command, a phone app) sends it a message over the network, it wakes up, computes an answer, sends the answer back, and goes back to waiting.

That's all we built. Your FastAPI program is a piece of Python that:

1. Starts up
2. Loads the YOLO model into memory (so it's ready)
3. Listens on port 8000
4. When a message arrives at `/api/detect`, it runs the model on the attached image and sends back JSON

It keeps doing that forever until you kill it.

### What's an "endpoint"?

An endpoint is just a URL the server knows how to answer. We made two:

| Endpoint | What it does |
|---|---|
| `GET /api/health` | "Are you alive? Is the model loaded?" |
| `POST /api/detect` | "Here's a photo, count the durians" |

`GET` and `POST` are the two main "verbs" in HTTP. `GET` means "give me information" (no body). `POST` means "I'm sending you data" (has a body — in our case, an image file).

### What does the curl command actually do?

When you ran:

```bash
curl -X POST http://127.0.0.1:8000/api/detect -F "file=@demo-image/demo.jpg"
```

curl:

1. Opened a network connection to `127.0.0.1` (your own computer) on port 8000.
2. Sent a `POST` request to `/api/detect` with the image attached as "form data" (`-F`).
3. Waited for a response.
4. Printed it.

`127.0.0.1` is a special IP that always means "this computer." Browsers, phones, anything on your network can also talk to FastAPI — but only `127.0.0.1` for now because we told uvicorn to only listen there.

---

## Part 2: Why did we split into 7 files?

Your original Streamlit app was 107 lines in one file. We just made 7 files. Why?

**The "single responsibility" idea.** Each file does *one* thing. When something breaks, you know exactly which file to look at. When you need to change behavior, you change one file, not hunt through 200 lines.

```
config.py             → "what are the rules and limits?"
schemas.py            → "what does our API return and accept?"
services/model.py     → "how do we load the model?"
services/inference.py → "how do we actually run detection?"
routes/health.py      → "how do we answer health questions?"
routes/detect.py      → "how do we answer detection requests?"
main.py               → "wire everything together"
```

This is **the most important habit** to learn — separating "what" from "how" from "where." Streamlit didn't force it on you. Real apps do.

---

## Part 3: Walking through each file

### File 1: `config.py` — the rule book

```python
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MODEL_PATH = ROOT / "model" / "best.pt"

DEFAULT_CONF = 0.25
DEFAULT_IOU = 0.5
MAX_UPLOAD_BYTES = 20 * 1024 * 1024
MAX_LONG_EDGE = 1280

ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/jpg"}
```

**Line by line:**

- `Path(__file__).resolve().parents[2]` — `__file__` is the current file's path. `.resolve()` makes it absolute. `.parents[2]` goes up 2 directories. Since this file is at `apps/api/config.py`, going up 2 levels gives us the project root. Now `MODEL_PATH` is always correct no matter where you run the server from.

- `MAX_UPLOAD_BYTES = 20 * 1024 * 1024` — 20 megabytes. Written this way because it's self-documenting: 20 × 1024 (bytes per KB) × 1024 (KB per MB).

- `MAX_LONG_EDGE = 1280` — we'll resize any uploaded image so its longest side is at most 1280 pixels. A phone photo is usually 4000+ pixels wide; running YOLO on that is slow and wasteful since the model only sees 640×640 anyway internally.

- `ALLOWED_CONTENT_TYPES = {...}` — a Python *set* (the curly braces). Looking something up in a set is faster than in a list. We'll reject anything that isn't a JPEG or PNG.

**Why this file exists:** when you want to tweak the max upload size or change the model path, you change it *here* and the whole app picks it up. No hunting through code.

---

### File 2: `schemas.py` — the API contract

```python
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
```

**What is Pydantic?** It's a Python library that lets you describe data shapes. `BaseModel` is its core building block.

When you write:

```python
class Detection(BaseModel):
    id: int
    conf: float
```

You're saying: "A `Detection` is an object with an `id` (must be an integer) and a `conf` (must be a float)."

If you try to create a `Detection(id="hello", conf="oops")`, Pydantic raises an error. **This is validation.** It's a safety net that catches bugs at the boundary.

**Why this matters for our API:**

- FastAPI uses these classes to know exactly what JSON to send back.
- FastAPI uses them to auto-generate that Swagger UI you saw at `/docs`.
- TypeScript on the frontend will mirror these exact shapes, so the data flows cleanly.

**Two interesting bits:**

- `detections: list[Detection]` — a list whose every element must itself be a `Detection`. Pydantic enforces this.
- `error: str | None = None` — this field is either a string OR `None`. The `= None` makes it optional with a default. So `HealthResponse(model_loaded=True, model_path="...")` works without specifying `error`.

---

### File 3: `services/model.py` — the singleton

```python
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
```

**The singleton pattern.** A YOLO model loads in ~1 second and takes hundreds of MB of RAM. We want to load it **once**, not every time someone hits the API.

The trick is the module-level variable `_model = None`. The first time `get_model()` is called:

- `_model is None`, so we load it.
- We *assign* it to `_model`.

Every subsequent call:

- `_model is not None`, so we return the already-loaded one immediately.

The leading underscore (`_model`) is Python convention: "this is private, don't touch from outside."

**The `global` keyword:** Python defaults to local variables inside functions. To *reassign* a module-level variable from inside a function, you say `global _model`. Without it, Python would just make a new local `_model` and the module-level one would never change.

**Lazy import:** `from ultralytics import YOLO` is *inside* the function, not at the top. Why? Importing ultralytics is slow (it pulls in PyTorch, ~5 seconds the first time). If a tool just wants to read `model_status()` without ever loading the model, we don't pay that cost.

### The warmup function

```python
def warmup() -> None:
    try:
        model = get_model()
        dummy = np.zeros((640, 640, 3), dtype=np.uint8)
        model.predict(dummy, verbose=False)
    except Exception as exc:
        global _load_error
        _load_error = str(exc)
```

The very first prediction a model does is slow (~2 seconds) because PyTorch is doing first-time setup. If we let this happen on a real user's request, they wait. So we feed it a fake 640×640 black image at startup to "warm up" the engine. By the time the first real request comes in, it's already hot.

`np.zeros((640, 640, 3), dtype=np.uint8)` creates an array of all zeros — width 640, height 640, 3 color channels (RGB), each value an unsigned 8-bit integer (0-255). That's a black image.

---

### File 4: `services/inference.py` — the actual work

This is the most important file. Let me break it into pieces.

```python
def _resize_long_edge(image: Image.Image, max_edge: int) -> Image.Image:
    w, h = image.size
    long_edge = max(w, h)
    if long_edge <= max_edge:
        return image
    scale = max_edge / long_edge
    return image.resize((int(w * scale), int(h * scale)), Image.LANCZOS)
```

A helper. If the image's longest side is already ≤ 1280, return it unchanged. Otherwise scale both dimensions down proportionally. `Image.LANCZOS` is a high-quality resampling algorithm — slower but sharper than the default.

The leading underscore says "this is private to this file."

### The main function

```python
def run_detection(image_bytes: bytes, conf: float, iou: float) -> DetectResponse:
    image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    image = _resize_long_edge(image, MAX_LONG_EDGE)
    width, height = image.size
```

- `image_bytes` is the raw file content (just bytes — what was on disk).
- `io.BytesIO(image_bytes)` wraps those bytes in a thing that *looks like a file* to PIL. PIL's `Image.open` normally takes a filename; this lets us hand it bytes from memory instead.
- `.convert("RGB")` ensures 3 channels (some PNGs have alpha, some JPGs are grayscale — we standardize).

```python
    model = get_model()
    start = time.perf_counter()
    results = model.predict(image, conf=conf, iou=iou, verbose=False)
    inference_ms = (time.perf_counter() - start) * 1000.0
```

- `time.perf_counter()` is Python's most accurate timer for "how long did this take."
- `verbose=False` stops ultralytics from spamming the terminal.
- `* 1000.0` converts seconds to milliseconds.

This is the **exact same** `model.predict(...)` call from your original Streamlit app. We just measured the time around it.

```python
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
```

Ultralytics returns boxes as `[center_x, center_y, width, height]`. We convert to `[top_left_x, top_left_y, width, height]` because that's what browsers/CSS expect for drawing rectangles.

- `.cpu()` moves data off the GPU (if it was there) onto the CPU.
- `.numpy()` converts PyTorch tensors to NumPy arrays so we can iterate them normally.
- `zip(xywh, confs)` pairs each box with its confidence; `enumerate` gives us the index too.

```python
    annotated_bgr = result.plot()
    annotated_rgb = cv2.cvtColor(annotated_bgr, cv2.COLOR_BGR2RGB)
    ok, png = cv2.imencode(".png", cv2.cvtColor(annotated_rgb, cv2.COLOR_RGB2BGR))
    if not ok:
        raise RuntimeError("Failed to encode annotated image")
    image_b64 = "data:image/png;base64," + base64.b64encode(png.tobytes()).decode("ascii")
```

This is the bit that draws the boxes on the image.

- `result.plot()` returns the image with boxes drawn on it (in BGR order — OpenCV's quirk).
- We encode it as PNG bytes (`cv2.imencode`).
- We then `base64`-encode those bytes so they can fit inside a JSON string. Base64 turns arbitrary binary data into safe text characters.
- The `"data:image/png;base64,"` prefix is a standard called a **data URL** — you can paste that exact string into an HTML `<img src="...">` and it just works.

That's why our frontend won't need a separate request to fetch the annotated image — it's already inside the JSON response.

```python
    return DetectResponse(
        count=len(detections),
        detections=detections,
        image_base64=image_b64,
        inference_ms=round(inference_ms, 2),
        image_size=(width, height),
    )
```

We build a Pydantic `DetectResponse` object. FastAPI will automatically convert it to JSON when sending back to the client.

---

### File 5: `routes/health.py` — a simple endpoint

```python
router = APIRouter()


@router.get("/api/health", response_model=HealthResponse)
def health() -> HealthResponse:
    loaded, error = model_status()
    return HealthResponse(model_loaded=loaded, model_path=str(MODEL_PATH), error=error)
```

**What's a router?** Think of it as a mini-app. We define routes here, then later in `main.py` we glue them to the main app. This lets us keep `detect` routes and `health` routes in separate files.

**What's `@router.get(...)`?** That `@` symbol is a **decorator**. It looks confusing but it's just shorthand for:

```python
# What @router.get(...) actually does:
def health():
    ...
health = router.get("/api/health", response_model=HealthResponse)(health)
```

In plain English: "Take this function `health`, register it with the router so that GET requests to `/api/health` will trigger it." That's all.

**`response_model=HealthResponse`** tells FastAPI: "the response will match this Pydantic shape." FastAPI uses it to validate the response *and* to show it in the docs.

---

### File 6: `routes/detect.py` — the main endpoint

```python
@router.post("/api/detect", response_model=DetectResponse)
async def detect(
    file: UploadFile = File(...),
    conf: float = Form(DEFAULT_CONF),
    iou: float = Form(DEFAULT_IOU),
) -> DetectResponse:
```

**The function signature is doing a lot of work.** FastAPI reads it and knows:

- This is a `POST` to `/api/detect`.
- It expects a file uploaded as form data (the `File(...)`).
- It expects two optional form fields `conf` and `iou`, defaulting to our config values.

The `...` inside `File(...)` is Python's "Ellipsis" object — FastAPI uses it as a sentinel meaning "required, no default."

**`async def`** — this is a Python keyword that lets the function "pause" while waiting for I/O. When the user is uploading a 5 MB image, the server doesn't sit blocked — it can serve other users in the meantime. You don't need to fully understand async yet; just know FastAPI prefers `async def` for handlers that touch I/O.

```python
    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported file type: {file.content_type}. Use JPEG or PNG.",
        )
```

Reject non-image uploads. `HTTPException` is FastAPI's way of saying "send the client an error response." 415 is HTTP code for "Unsupported Media Type" — a specific, standard code clients can react to programmatically.

```python
    data = await file.read()
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File too large: {len(data)} bytes (max {MAX_UPLOAD_BYTES}).",
        )
```

`await file.read()` reads the upload into memory as bytes. The `await` keyword pairs with `async` — it means "pause here until done, but let other requests be handled in the meantime."

413 is "Payload Too Large." Again, a standard code.

```python
    if not (0.0 < conf <= 1.0) or not (0.0 < iou <= 1.0):
        raise HTTPException(status_code=422, detail="conf and iou must be in (0, 1].")

    try:
        return run_detection(data, conf=conf, iou=iou)
    except UnidentifiedImageError:
        raise HTTPException(status_code=415, detail="Could not decode image.")
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
```

- Validate the slider values are reasonable.
- Try to run detection.
- If PIL can't decode the file (corrupt image), respond with 415.
- If the model weights are missing, respond with 503 ("Service Unavailable").

The function returns a `DetectResponse`; FastAPI handles serializing it to JSON.

---

### File 7: `main.py` — the wiring

```python
@asynccontextmanager
async def lifespan(_app: FastAPI):
    warmup()
    yield


app = FastAPI(title="DurianVision AI", lifespan=lifespan)
```

**Lifespan** is FastAPI's "do this on startup, do that on shutdown" mechanism. Before `yield` runs at startup, after `yield` runs on shutdown. We just need warmup at startup, so there's nothing after `yield`.

The leading underscore in `_app` is a hint to readers: "we receive this parameter but we don't use it."

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)
```

**CORS = Cross-Origin Resource Sharing.** Browsers refuse to let a page from `localhost:3000` call an API at `localhost:8000` unless the API explicitly says "I'm OK with that origin." This middleware adds the right headers. We're allowing only `localhost:3000` (your future Next.js dev server).

**Middleware** runs before/after every request — like a security guard at the door of the building.

```python
app.include_router(health.router)
app.include_router(detect.router)
```

Plug our two routers into the main app. Now `/api/health` and `/api/detect` are live.

```python
@app.get("/")
def root():
    return {"name": "DurianVision AI", "docs": "/docs", "health": "/api/health"}
```

A friendly hello at the root URL so visitors don't see a 404.

---

## Part 4: The full request lifecycle

When you ran the curl, this happened:

```
1.  curl opens TCP connection to 127.0.0.1:8000
2.  curl sends: POST /api/detect HTTP/1.1
                Content-Type: multipart/form-data; boundary=...
                <image bytes>
3.  uvicorn receives the bytes, hands them to FastAPI
4.  FastAPI matches the URL "/api/detect" → detect() function
5.  FastAPI parses the multipart body, builds an UploadFile
6.  detect() validates content_type, size, sliders
7.  detect() calls run_detection(bytes, conf, iou)
8.  run_detection opens the image with PIL
9.  resize to 1280px long edge
10. get_model() returns the already-loaded model (warmup cached it)
11. model.predict(...) → boxes + confidences
12. Convert boxes to (x, y, w, h) format
13. Draw annotated image with result.plot()
14. PNG-encode → base64-encode → wrap in data URL
15. Build DetectResponse pydantic object
16. FastAPI serializes it to JSON
17. uvicorn sends the JSON back to curl
18. curl prints it
```

Total time for steps 7–15: ~66 ms.

---

## Part 5: What you learned

You can now answer all of these without looking:

- **What's an endpoint?** A URL the server knows how to handle.
- **GET vs POST?** GET = read, POST = send data.
- **What's Pydantic doing?** Validating data shapes and generating the OpenAPI schema.
- **Why a singleton for the model?** Loading is slow; do it once.
- **Why warmup?** First prediction is extra-slow; spend that cost at startup, not on a real user.
- **What's base64 and why use it?** Encode binary as text so it fits inside JSON.
- **What's CORS?** A browser safety rule we have to opt into.
- **What's a decorator?** A function that wraps another function. `@router.get(...)` registers a function as a handler.
- **What's a router?** A grouping of related endpoints.
- **What's `async`/`await`?** Lets the server handle other requests while one is waiting on I/O.

You went from "Streamlit re-runs my script when I click" to "I built a real REST API." That's the conceptual leap that separates beginners from intermediates.

---

## Phase 1 verified results

Tested against `demo-image/demo.jpg`:

- **49 durians detected**
- **65.6 ms** inference time
- Highest-confidence box: **91.6%**
- Image resized to 960 × 1280
- Annotated PNG returned inline as base64

## How to restart the server later

```bash
python -m uvicorn apps.api.main:app --reload --host 127.0.0.1 --port 8000
```

Then visit:

- [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs) — Swagger UI (try the endpoints interactively)
- [http://127.0.0.1:8000/api/health](http://127.0.0.1:8000/api/health) — health check
