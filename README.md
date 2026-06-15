---
title: DurianVision AI
emoji: 🌲
colorFrom: yellow
colorTo: green
sdk: docker
app_port: 7860
pinned: false
license: mit
short_description: Count durians from canopy photos with a custom YOLOv8 model.
---

# DurianVision AI

**Live demo:** https://huggingface.co/spaces/nimnxmn/DurianVisionAI

![DurianVision AI screenshot](docs/screenshot.png)

End-to-end durian detection and counting from a single canopy photo. Upload a photo taken from beneath the tree looking up — the app draws bounding boxes around every durian and gives you an exact count.

- **Precision:** 95.7% · **Recall:** 91.6% · **mAP50:** 0.959
- **Dataset:** 958 hand-labeled boxes across 38 canopy photos, augmented 3× to 114 training images
- **Supports:** JPEG, PNG, HEIC (iPhone photos)

## Domain constraint

Images must be taken from a **nadir-to-canopy perspective** — camera positioned directly below the tree, pointing upward at the fruit canopy. This is the viewpoint the model was trained on. Standard side-on orchard photos will not detect correctly.

## How the model was built

The detector was trained end-to-end before a single line of app code was written. The whole pipeline:

```
[ Capture photos ] ─▶ [ Label in Roboflow ] ─▶ [ Train YOLOv8 (Colab GPU) ] ─▶ [ Evaluate on held-out images ]
```

1. **Data collection.** Photographed durian trees from the ground looking straight up into the canopy, in normal daylight. The aim was the *hard, realistic* case — fruit partially hidden behind leaves and branches — so the model learns to find durians it can only half-see.
2. **Labeling — Roboflow.** Hand-drew a bounding box around every visible durian: **958 boxes across 38 images**, all one `durian` class so the model stays focused on the fruit and ignores background (leaves, sky, branches). Exported in YOLOv8 format, which also generates the `data.yaml` the trainer reads.
3. **Training — YOLOv8 on Colab.** Preprocessed and augmented (3× per image → 114 training images), then fine-tuned from the `yolov8n.pt` checkpoint for **100 epochs at 1024 px** on a free Colab GPU. The best-scoring checkpoint is saved as `best.pt` and shipped here as `model/best.pt`. Full notebook: [`DurianVisionAI.ipynb`](DurianVisionAI.ipynb).
4. **Evaluation.** Scored on a held-out test set the model never saw during training — results below.

### Dataset & training detail

| Property | Value |
|---|---|
| Raw images | 38 |
| Annotations (bounding boxes) | 958 |
| Classes | 1 (`durian`) |
| Image resolution | 1024 × 1024 |
| Augmentation | 3× per source image |
| Total training images | 114 |

**Preprocessing**
- Auto-orient: applied
- Resize: fit within 1024 × 1024 (black-padded edges)

**Augmentations** (3 outputs per source image)
- Rotation: −15° to +15°
- Brightness: −15% to +15%
- Exposure: −10% to +10%
- Blur: up to 2.5 px
- Noise: up to 1.01% of pixels

**Training**
- Model: YOLOv8n · Epochs: 100 · Image size: 1024 px

## Model evaluation

| Metric | Value |
|---|---|
| Precision | 95.7% |
| Recall | 91.6% |
| mAP50 | 0.959 |

<p align="center">
  <img src="evaluation/BoxPR_curve.png" width="45%" alt="PR Curve"/>
  <img src="evaluation/BoxF1_curve.png" width="45%" alt="F1 Curve"/>
</p>
<p align="center">
  <img src="evaluation/confusion_matrix.png" width="60%" alt="Confusion Matrix"/>
</p>

## Stack

| Layer     | Tech                                                                                                  |
| --------- | ----------------------------------------------------------------------------------------------------- |
| Model     | YOLOv8 (Ultralytics), trained on Roboflow                                                             |
| Backend   | FastAPI, uvicorn, Pillow, OpenCV (headless)                                                           |
| Frontend  | Next.js 16 (App Router, static export), React 19, TypeScript, Tailwind CSS v4, shadcn/ui, next-themes |
| Container | Multi-stage Docker → single image                                                                     |
| Deploy    | Hugging Face Spaces (Docker runtime, port 7860)                                                       |

## Architecture

```
Browser  ──HTTP──▶  FastAPI (port 7860)
                      ├── GET  /              → static Next.js export
                      ├── GET  /api/health    → {model_loaded: true, ...}
                      └── POST /api/detect    → {count, detections[], image_base64, ...}
                            └─ YOLOv8 inference
```

In dev there are two processes (Next dev server on `:3000`, uvicorn on `:8000`). In production a single Docker container serves both the API and the pre-built frontend on port 7860.

## Run locally (dev)

Backend:

```powershell
python -m uvicorn apps.api.main:app --reload --host 127.0.0.1 --port 8000
```

Frontend:

```powershell
cd apps/web
npm install
npm run dev
```

Open <http://localhost:3000>.

## Build and run the production container

```bash
docker build -t durianvision .
docker run --rm -p 7860:7860 durianvision
```

Open <http://localhost:7860>.

## Project layout

```
apps/
  api/                 FastAPI backend
  web/                 Next.js frontend
    app/               App Router pages
    components/        Controls, ResultCard, ThemeToggle, ui/* (shadcn)
    lib/api.ts         Backend contract + fetch helper
evaluation/            Model eval plots (PR curve, F1 curve, confusion matrix)
docs/                  Phase walkthroughs (1–7)
model/best.pt          YOLOv8 weights
demo-image/            Demo image (49 durians)
DurianVisionAI.ipynb   Colab training notebook (download dataset → train → export best.pt)
Dockerfile             Multi-stage build (node → python)
```

See `docs/phase-N-walkthrough.md` for student-friendly explanations of each build phase.

## License

MIT.
