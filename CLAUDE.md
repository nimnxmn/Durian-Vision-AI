# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

DurianVision AI is a portfolio-grade web app for automated durian detection and counting from orchard images using a custom-trained YOLOv8 model. The model achieves 95.7% Precision, 91.6% Recall, and mAP50 of 0.959, trained on 958 hand-labeled boxes across 38 canopy photos (augmented 3× to 114 training images).

**Target audience:** Portfolio / demo viewers (recruiters, judges).

**Domain constraint:** Images must be captured from an under-canopy perspective (camera directly below the tree looking upward) for accurate detection.

---

## Current Status

| Phase | Description | Status |
|---|---|---|
| 0 | Project structure setup | ✅ Done |
| 1 | FastAPI backend with `/api/detect` | ✅ Done |
| 2 | Next.js frontend (ugly MVP) | ✅ Done |
| 3 | Core features (sliders, batch, downloads) | ✅ Done |
| 4 | Visual redesign (shadcn, theming, polish) | ✅ Done |
| 5 | Docker image (multi-stage build, runs locally on `:7860`) | ✅ Done |
| 6 | Stretch (camera, tests, CI) | ✅ Done |
| 7 | Post-launch polish (data-URL bug fix, demo image button, batch summary + grid layout) | ✅ Done |
| 8 | Git history setup (v2 branch, PR #1 merged to main, `streamlit-v1` tag) | ✅ Done |
| 9 | Hugging Face Spaces deploy | ✅ Done |
| 10 | UI redesign (green accent, drag-drop zone, Plus Jakarta Sans, hero layout, yellow annotations) | ✅ Done |

**Live URL:** https://huggingface.co/spaces/nimnxmn/DurianVisionAI

---

## Where we left off (2026-06-25)

**GitHub state — `nimnxmn/Durian-Vision-AI`:**
- `main` branch — fully deployed, synced with HF Spaces
- `streamlit-v1` tag — points at the last Streamlit commit, recoverable via `git checkout streamlit-v1`
- Binary files (images, model weights) tracked with Git LFS — run `git lfs pull` after cloning
- `docs/` is gitignored (personal walkthroughs, not tracked)

**HF Spaces state — `nimnxmn/DurianVisionAI`:**
- Running on cpu-basic free tier, port 7860
- Inference: varies on CPU (640px resize)
- HEIC/iPhone photos supported via `pi-heif` + `libheif1`
- `hfspace` git remote: `https://huggingface.co/spaces/nimnxmn/DurianVisionAI`

---

## Architecture

This is a **Next.js + FastAPI** app. The old `DurianVisionAI.py` (Streamlit) is kept for reference only — do not run it.

### Backend (FastAPI) — `apps/api/`

```
apps/api/
├── main.py              # FastAPI app, lifespan (warmup), CORS, router includes
├── config.py            # Constants: paths, limits, defaults
├── schemas.py           # Pydantic models: Detection, DetectResponse, HealthResponse
├── routes/
│   ├── health.py        # GET /api/health
│   └── detect.py        # POST /api/detect
└── services/
    ├── model.py         # Singleton YOLO loader + warmup
    └── inference.py     # Resize → predict → DetectResponse
```

**Model weights:** `model/best.pt`

**API endpoints:**
- `GET /api/health` → `{"model_loaded": true, "model_path": "...", "error": null}`
- `POST /api/detect` → multipart: `file` (image), `conf` (float, default 0.25), `iou` (float, default 0.5)
  Returns: `{count, detections[], image_base64, inference_ms, image_size}`
- `GET /` → redirect to docs

**Request flow:**
1. Upload lands at `routes/detect.py` — validates type, size, conf/iou range
2. Calls `services/inference.py::run_detection(bytes, conf, iou)`
3. PIL opens image → resize to 640px long edge → `model.predict()`
4. Boxes converted from center-xywh → top-left-xywh
5. PIL draws clean yellow bounding boxes (no labels) → base64 PNG → packed into `DetectResponse`

### Frontend (Next.js) — `apps/web/`

Next.js 16 App Router, TypeScript, Tailwind CSS v4, shadcn/ui, next-themes, Plus Jakarta Sans font.
In production, FastAPI serves the static Next.js export from `apps/web/out/`.

**Key components:**
- `components/drop-zone.tsx` — drag-and-drop file upload
- `components/controls.tsx` — upload area, camera, demo button, advanced settings
- `components/result-card.tsx` — detection result with prominent count display
- `components/theme-toggle.tsx` — Sun/Moon icon toggle

### Deployment target

Single Docker container on Hugging Face Spaces (cpu-basic, free tier).
FastAPI binds to port 7860. Serves API at `/api/*` and Next.js SPA at `/`.

---

## Setup & Running

### Backend

```bash
pip install -r requirements.txt
python -m uvicorn apps.api.main:app --reload --host 127.0.0.1 --port 8000
```

Visit:
- http://127.0.0.1:8000/docs — Swagger UI (interactive endpoint testing)
- http://127.0.0.1:8000/api/health — health check

### Frontend

```bash
cd apps/web
npm install
npm run dev   # starts on localhost:3000
```

---

## Key files

| File | Purpose |
|---|---|
| `model/best.pt` | YOLOv8 weights (~6 MB) |
| `demo-image/demo.jpg` | Demo image (49 durians, verified) |
| `sample_images/` | Under-canopy reference photos |
| `duriantest/` | Test images for model evaluation |
| `apps/api/config.py` | All tunable constants |
| `apps/api/schemas.py` | API data shapes (source of truth) |
| `apps/api/services/inference.py` | Detection + PIL annotation logic |
| `requirements.txt` | Python deps (pinned) |
