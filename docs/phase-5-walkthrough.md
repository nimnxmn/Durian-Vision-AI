# Phase 5 — A Complete Walkthrough

A student-friendly tour of how we turn the two-process dev setup into a single deployable Docker image and ship it to Hugging Face Spaces.

---

## Part 1: What is "deployment" actually?

Up to Phase 4, your app only works on your laptop. You start uvicorn in one terminal, `npm run dev` in another, and open `localhost`. That's *running* the app — not *deploying* it.

**Deployment** means putting the app on a computer somewhere on the public internet so a stranger with the URL can use it. Three jobs to handle:

1. **Bundle.** Get all the code, dependencies, model weights, and config into one shippable artifact.
2. **Host.** Find a computer to run that artifact 24/7.
3. **Address.** Give it a URL people can type.

**Docker** solves #1: it packages your app and *everything it needs to run* (Python, Node libs, OS libs like libgl1) into an image. Anyone with Docker installed can run that image and get the exact same behavior — no "works on my machine."

**Hugging Face Spaces** solves #2 and #3 for free: push an image, get a URL like `https://<user>-durianvision.hf.space`.

### Why one container instead of two?

In dev we had two processes: Next.js dev server (`:3000`) and FastAPI (`:8000`). In production we want **one**. Reasons:

- Hugging Face Spaces' free tier exposes exactly one HTTP port (7860). You can't run two servers.
- Two processes means two things to crash, two log streams, two health checks. One is simpler.
- The frontend doesn't need a Node runtime in production. Once we pre-build the React tree into static HTML/CSS/JS, it's just files. Any web server can serve those files.

So the deployment recipe is:

```
1. node:20  →  npm run build  →  static files in apps/web/out/
2. python   →  uvicorn ... serves /api/* and also serves apps/web/out/ at /
3. Both happen in a single Docker image via a multi-stage build.
```

---

## Part 2: Why we structured it this way

### Static export for Next.js

Next.js has three rendering modes:

- **Server-side rendering (SSR)** — every request runs Node and React to generate HTML. Powerful but requires a Node process in production.
- **Incremental Static Regeneration (ISR)** — a cache layer on top of SSR. Still needs Node.
- **Static export** — at build time, Next.js renders every page once and writes them as plain HTML files. No Node needed at runtime.

Our app has zero per-request server work on the frontend — the page is the same for everyone, and all dynamic behavior happens in the browser (fetching `/api/detect`). Static export is the right pick. We turn it on with `output: "export"` in `next.config.ts`.

After `npm run build`, you get `apps/web/out/index.html`, `apps/web/out/_next/static/...`, and friends. Open `index.html` in a browser directly and it works (except the API calls, which need a server). Mount it from FastAPI and the whole app works.

### Same-origin in production, different-origin in dev

In Phase 2–4, the frontend hit `http://127.0.0.1:8000/api/detect` — a different *origin* than `localhost:3000`, which is why we needed CORS.

In production, the frontend is served by FastAPI on port 7860, and the API is *also* on port 7860. Same origin. No CORS needed. The fetch URL can just be `/api/detect` (relative path).

The fix: change `lib/api.ts` so `API_URL` defaults to `""` (empty string). Then `fetch("/api/detect")` works in production. In dev we still need the full URL — handled by `.env.development`, which Next.js auto-loads when `NODE_ENV=development`. The file contains:

```
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
```

Result: dev hits `http://127.0.0.1:8000/api/detect`, prod hits `/api/detect` on the same origin.

### Multi-stage Docker: small final image, fast rebuilds

A Docker **multi-stage build** uses multiple `FROM` lines in one Dockerfile. Each stage starts a fresh container; you can copy files between stages with `COPY --from=`.

Our two stages:

1. **`web` stage** — a Node image. Installs `npm` deps, runs `npm run build`, produces `apps/web/out/`. After this stage finishes, all the Node dependencies (~400 MB of `node_modules`) are *discarded*. We only keep the build output.
2. **`runtime` stage** — a Python image. Installs Python deps and OS libs that ultralytics/opencv need. Copies in the backend code, the model weights, and the static files from stage 1.

The final image is just the second stage. The Node toolchain isn't in it. That makes the image substantially smaller (~1 GB vs 2 GB+) and avoids shipping irrelevant attack surface.

### Why FastAPI's StaticFiles mount goes *last*

In FastAPI you can attach multiple handlers to URL paths. Order matters. We want:
- `/api/health` → JSON
- `/api/detect` → JSON
- `/` → `index.html`
- `/_next/static/foo.css` → that file

The `app.include_router(detect.router)` adds the API routes. Then `app.mount("/", StaticFiles(...))` mounts a sub-app at `/`. Because mounts are checked **after** routes, the API routes win for `/api/*`, and the static mount catches everything else. The `html=True` option tells StaticFiles to serve `index.html` automatically when someone hits a directory (including `/`).

### SPA fallback

If someone deep-links to `/results/42` (a route the frontend would render via client-side navigation), FastAPI's static mount returns 404 because no `results/42` file exists. We register a 404 handler that:
- Returns JSON 404 if the path starts with `/api/`.
- Otherwise serves `index.html`, so the React app can take over and render the right page.

Our app doesn't actually use multi-page routing yet, but having the fallback in place makes it future-proof.

---

## Part 3: Walking through each file

### File 1: `apps/web/next.config.ts`

```ts
const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  trailingSlash: false,
};
```

- `output: "export"` — emit static HTML/CSS/JS to `out/`. No server needed at runtime.
- `images: { unoptimized: true }` — Next's `<Image>` component normally requires a Node-based optimizer service. Static export can't run one. We tell Next to leave image URLs as-is. (We use plain `<img>` anyway, so this is belt-and-braces.)
- `trailingSlash: false` — keep URLs like `/about`, not `/about/`. Just a preference.

### File 2: `apps/web/.env.development`

```
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
```

Auto-loaded by Next when `NODE_ENV=development` (i.e. `npm run dev`). In production builds (`npm run build`), the variable is empty unless explicitly set, so `API_URL` falls back to `""`.

### File 3: `apps/web/lib/api.ts` (one-line change)

```ts
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";
```

If the env var is set, use it; otherwise default to empty. With an empty base, `fetch(`${""}/api/detect`)` becomes `fetch("/api/detect")` — relative, same-origin.

### File 4: `apps/api/config.py` (one-line addition)

```python
STATIC_DIR = ROOT / "apps" / "web" / "out"
```

Where the built frontend lives.

### File 5: `apps/api/main.py` — the big rewrite

```python
if STATIC_DIR.exists():
    app.mount(
        "/",
        StaticFiles(directory=STATIC_DIR, html=True),
        name="static",
    )
else:
    @app.get("/")
    def root() -> JSONResponse:
        return JSONResponse({...})
```

We **conditionally** mount the static files. In development (you haven't run `npm run build`), `STATIC_DIR` doesn't exist and we fall back to the JSON landing page. In Docker, the previous stage produced `out/`, so the mount kicks in and serves the SPA at `/`.

The 404 handler at the bottom serves `index.html` for any non-API miss, enabling SPA-style deep links:

```python
@app.exception_handler(404)
async def spa_fallback(request, exc):
    if request.url.path.startswith("/api/"):
        return JSONResponse({"detail": "Not Found"}, status_code=404)
    index = STATIC_DIR / "index.html"
    if index.exists():
        return FileResponse(index)
    return JSONResponse({"detail": "Not Found"}, status_code=404)
```

### File 6: `Dockerfile` — multi-stage build

```dockerfile
# ---- stage 1: build the frontend ----
FROM node:20-alpine AS web
WORKDIR /app/apps/web
COPY apps/web/package.json apps/web/package-lock.json ./
RUN npm ci
COPY apps/web/ ./
RUN npm run build
```

We copy `package.json` *first*, then run `npm ci`. Docker caches each step. If only your React code changes (not your deps), Docker reuses the cached `npm ci` layer — saves a minute on every rebuild.

```dockerfile
# ---- stage 2: python runtime ----
FROM python:3.11-slim AS runtime
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 PORT=7860
RUN apt-get update && apt-get install -y --no-install-recommends \
        libglib2.0-0 libsm6 libxext6 libxrender1 libgl1 \
    && rm -rf /var/lib/apt/lists/*
COPY requirements.txt ./
RUN pip install -r requirements.txt
COPY apps/api ./apps/api
COPY model ./model
COPY --from=web /app/apps/web/out ./apps/web/out
EXPOSE 7860
CMD ["sh", "-c", "uvicorn apps.api.main:app --host 0.0.0.0 --port ${PORT:-7860}"]
```

Notes:

- `python:3.11-slim` is the small Debian-based Python image (~150 MB).
- The `apt-get install` line pulls in the C libraries that OpenCV and a few other Python packages dynamically link against. Without them, you get cryptic `ImportError: libGL.so.1: cannot open shared object file` errors at startup. These exact packages are the standard recipe for `opencv-python-headless` on slim images.
- `pip install -r requirements.txt` installs FastAPI, uvicorn, ultralytics, opencv-python-headless, Pillow, numpy.
- We copy the backend, the model weights, and the static frontend (from stage 1) into the runtime image.
- `EXPOSE 7860` is documentation; Hugging Face Spaces reads `app_port: 7860` from the README and routes traffic there.
- The `CMD` uses `${PORT:-7860}` so the container honors `$PORT` if Spaces sets it (it does), or defaults to 7860 for local `docker run`.

### File 7: `.dockerignore`

A long ignore list so the Docker build context stays small. Most important: `node_modules`, `.next`, `__pycache__`, `.git`, `sample_images`, `duriantest`. Each of those is megabytes or gigabytes of stuff that doesn't need to be in the image.

The `!demo-image/demo.jpg` exception preserves the one demo image while excluding everything else in `demo-image/`.

### File 8: `README.md` — with Hugging Face Spaces frontmatter

```yaml
---
title: DurianVision AI
emoji: 🌿
colorFrom: yellow
colorTo: green
sdk: docker
app_port: 7860
pinned: false
---
```

Hugging Face Spaces reads the YAML frontmatter at the top of `README.md` to configure the Space. `sdk: docker` means "I will build my own Dockerfile" (as opposed to Streamlit/Gradio templates). `app_port: 7860` is the port Spaces will route traffic to. The other fields are display metadata.

The rest of the README is the project description recruiters will see when they land on the Space.

---

## Part 4: The full deployment lifecycle

What happens when you `docker build && docker run`:

1. **Docker reads the Dockerfile.** Stage 1 begins on a fresh `node:20-alpine` container.
2. **Stage 1 step 1:** `WORKDIR /app/apps/web` makes the working directory.
3. **Stage 1 step 2:** `COPY package.json package-lock.json` — only the lockfiles. Cacheable.
4. **Stage 1 step 3:** `RUN npm ci` — installs every dependency exactly as locked. About a minute on a fresh build, instant on rebuilds.
5. **Stage 1 step 4:** `COPY apps/web/ ./` — your source code. Cache invalidates here when you edit any file in `apps/web`.
6. **Stage 1 step 5:** `RUN npm run build` — Next.js compiles TS, runs Tailwind, generates `out/`.
7. **Stage 1 ends.** The node container is *frozen*. We never run it again. Its filesystem is just a source we can `COPY --from=` from.
8. **Stage 2 begins on a fresh `python:3.11-slim`.** Installs apt packages, pip packages, copies backend code and model.
9. **`COPY --from=web /app/apps/web/out ./apps/web/out`** — pulls the frozen output of stage 1 into the new image.
10. **Final image is tagged `durianvision`.** Size: ~1.3 GB (most of it is ultralytics + PyTorch + opencv).

When you `docker run -p 7860:7860 durianvision`:

11. The container starts, the `CMD` runs uvicorn.
12. uvicorn imports `apps.api.main:app`. The lifespan hook fires, `warmup()` loads `model/best.pt` into memory.
13. uvicorn listens on `0.0.0.0:7860`. Your host's port 7860 maps to it.
14. A browser hits `http://localhost:7860/` — FastAPI's routes don't match, the StaticFiles mount serves `apps/web/out/index.html`.
15. The browser loads `_next/static/...` chunks — also served by StaticFiles.
16. The user uploads an image — JS calls `fetch("/api/detect", ...)` (same origin, no CORS).
17. FastAPI's `/api/detect` route runs YOLO, returns JSON.
18. JS renders the result. Same flow as Phases 2–4, just on a different port.

### Pushing to Hugging Face Spaces

(You'll do this manually when the project is finished — out of scope for the walkthrough code.)

1. Create a new Space at <https://huggingface.co/new-space>. Pick "Docker" as the SDK.
2. Clone the Space's git repo locally.
3. Copy this project's files in, including `Dockerfile`, `README.md` (with frontmatter), the `apps/` tree, `requirements.txt`, and `model/best.pt`.
4. `git push`. The Space builds the Docker image and starts the container.
5. After ~5 minutes you have a URL like `https://<user>-durianvision.hf.space`. Done.

---

## Part 5: What you now understand

- **The difference between SSR, ISR, and static export** in Next.js, and why we picked static export.
- **Multi-stage Docker builds** and how to use them to keep the final image small.
- **Layer caching** — why we copy `package.json` before the rest of the source.
- **OS-level deps for Python ML libs** (libgl1, libglib, etc.) and where they come from.
- **FastAPI's `StaticFiles` mount** and the route-then-mount order.
- **SPA fallback via a 404 handler** — how to serve `index.html` for client-side routes.
- **Same-origin in prod vs. different-origin in dev**, and using `.env.development` to bridge them.
- **Hugging Face Spaces' README frontmatter** as the deployment config.

---

## Verified test results

- `npm run build` in `apps/web` with `output: "export"` — clean. Output appears in `apps/web/out/` (verified: `index.html`, `_next/`, `404.html`).
- `python -c "from apps.api.main import app; print([r.path for r in app.routes][:5])"` — imports cleanly: `['/openapi.json', '/docs', '/docs/oauth2-redirect', '/redoc', '/api/health']`. The static mount and API routes coexist.

End-to-end manual test (run yourself):

1. Build the image:
   ```bash
   docker build -t durianvision .
   ```
2. Run it:
   ```bash
   docker run --rm -p 7860:7860 durianvision
   ```
3. Open <http://localhost:7860>. You should see the full UI; uploads should work end-to-end without any CORS errors.
4. `curl http://localhost:7860/api/health` should return `{"model_loaded": true, ...}`.

## How to restart this phase

For local dev (two processes, hot reload):
```powershell
python -m uvicorn apps.api.main:app --reload --host 127.0.0.1 --port 8000
```
```powershell
cd apps/web; npm run dev
```

For a production-like single-container run:
```bash
docker build -t durianvision .
docker run --rm -p 7860:7860 durianvision
```

---

**Up next — Phase 6 (stretch):** backend pytest, frontend vitest, GitHub Actions CI, and an optional camera-capture button so you can demo the model with your phone's webcam directly in the browser.
