# Phase 9 Walkthrough — Hugging Face Spaces Deployment

## Part 1: What did we just build, and why?

In Phase 9 we took the Docker image that already worked on your local machine and deployed it to the internet so anyone can use it — no installation required. The hosting platform is **Hugging Face Spaces**, a free cloud service that runs Docker containers and gives each one a public URL.

Before this phase, the app existed only on your computer. After this phase, you can share a single link with a recruiter and they can try the app instantly in their browser.

---

## Part 2: Why we structured it this way

### Why Hugging Face Spaces?

- **Free** — the cpu-basic tier costs nothing
- **Docker-native** — HF reads your `Dockerfile` and builds the image for you, exactly like running `docker build` locally
- **No server management** — you don't configure nginx, SSL certificates, or firewalls. HF handles all of it
- **ML-friendly** — the platform is built for AI demos, so it's a natural fit for a YOLOv8 project

### Why Git LFS?

Binary files (images, model weights) are large and change rarely. Git was designed for text — storing large binaries in regular git bloats the repository history permanently. Git LFS (Large File Storage) replaces binary files in git with small pointer files and stores the actual data separately on a content-delivery server.

HF requires LFS (or their newer XET system) for binary files over a size threshold. We chose LFS because it is a widely-supported standard.

### Why port 7860?

Hugging Face Spaces injects `PORT=7860` into every Docker container. Our `Dockerfile` already honored this with `${PORT:-7860}`, so no changes were needed to make it work on HF.

---

## Part 3: What we changed and why

### `.gitattributes` (new)

Created by `git lfs track "*.jpg" "*.jpeg" "*.png" "*.pt"`. Tells git which file extensions should be handled by LFS instead of regular git storage.

### `requirements.txt` — added `pi-heif`

iPhones save photos in HEIC format even when named `.jpg`. PIL (Pillow) cannot open HEIC files by default. `pi-heif` is a plugin that adds HEIC support to PIL.

### `apps/api/main.py` — register HEIC opener

```python
try:
    import pi_heif
    pi_heif.register_heif_opener()
except Exception:
    pass
```

Called once at startup, before any requests arrive. After this line, `PIL.Image.open()` transparently handles HEIC files as if they were normal images. The `try/except` prevents the app from crashing if `pi_heif` fails to import in an environment where it is not installed.

### `Dockerfile` — added `libheif1`

`pi-heif` is a Python wrapper around `libheif`, a C library. On the `python:3.11-slim` Docker base image (Debian Linux), `libheif` is not pre-installed. Without it, `pi_heif` imports successfully but cannot actually decode any HEIC data.

```dockerfile
RUN apt-get update && apt-get install -y --no-install-recommends \
        libglib2.0-0 libsm6 libxext6 libxrender1 libgl1 libheif1 \
```

### `apps/api/config.py` — `MAX_LONG_EDGE` reduced from 1280 to 640

YOLOv8's native input size is 640×640 pixels. Resizing to 1280px before inference meant the model internally downscaled the image anyway — doubling the preprocessing work for no accuracy gain. Reducing to 640px cut inference time from ~40 seconds to ~527 ms on HF's free CPU tier.

### `.github/workflows/ci.yml` — added `lfs: true`

After migrating to LFS, the model weights (`model/best.pt`) and test images were stored as pointer files in git. The CI jobs that run pytest and build the Docker image need the real files. Adding `lfs: true` to `actions/checkout` tells GitHub Actions to download the actual LFS content during checkout.

```yaml
- uses: actions/checkout@v4
  with:
    lfs: true
```

---

## Part 4: The full deployment lifecycle

### First deploy

```
Local machine
  │
  ├─ git remote add hfspace https://huggingface.co/spaces/nimnxmn/DurianVisionAI
  ├─ git lfs migrate import --include="*.jpg,*.jpeg,*.png,*.pt" --everything
  └─ git push hfspace main
         │
         ▼
Hugging Face receives the push
  │
  ├─ Reads Dockerfile from repo root
  ├─ Stage 1: node:20-alpine → npm ci → npm run build → Next.js static export
  ├─ Stage 2: python:3.11-slim → apt-get install → pip install → copy files
  └─ Starts container: uvicorn apps.api.main:app --host 0.0.0.0 --port 7860
         │
         ▼
App is live at https://huggingface.co/spaces/nimnxmn/DurianVisionAI
```

### Every update after that

```
Edit code locally
  └─ git add / git commit
  └─ git push hfspace main
         │
         ▼
HF detects the push → rebuilds Docker image → restarts container
```

### What happens when a user visits the app

```
User browser  ──GET /──▶  FastAPI (port 7860)
                              └─ StaticFiles serves apps/web/out/index.html
                                    │
                                    ▼
                           Next.js app loads in browser
                                    │
                           User uploads photo
                                    │
                              POST /api/detect
                                    │
                           YOLOv8 runs inference
                                    │
                           Returns {count, image_base64, ...}
                                    │
                           Browser displays annotated image + count
```

---

## Part 5: What you now understand

After this phase you understand:

- **Hugging Face Spaces** — a free cloud platform that builds and runs Docker containers, ideal for ML demos
- **Git LFS** — how to store large binary files (images, model weights) outside of regular git history
- **HEIC/HEIF** — the image format iPhones use, and how to add support for it in a Python app
- **Port binding** — why `0.0.0.0` (all interfaces) is needed in production but `127.0.0.1` (localhost only) is safer in development
- **Image resize tradeoff** — reducing input resolution from 1280px to 640px cut inference time ~80× with no meaningful accuracy change on this dataset

---

## Verified results

- **Live URL:** https://huggingface.co/spaces/nimnxmn/DurianVisionAI
- **Demo image (49 durians):** detected correctly, ~527 ms inference
- **iPhone HEIC photos:** supported
- **CI:** passes with `lfs: true` on checkout

## How to redeploy from scratch

```powershell
# Add HF remote (if not already set)
git remote add hfspace https://huggingface.co/spaces/nimnxmn/DurianVisionAI

# Push (HF will rebuild automatically)
git push hfspace main
```

If prompted for credentials: username = your HF username, password = your HF write token (`hf_...`).
