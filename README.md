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

End-to-end durian detection and counting from a single canopy photo. Custom-trained YOLOv8 model wrapped in a FastAPI backend with a Next.js + shadcn/ui frontend.

- **Precision:** 95.7% · **Recall:** 91.6% · **mAP50:** 0.959
- **Inference:** ~66 ms per image on CPU
- **Dataset:** 2,800+ annotated durian instances, augmented for canopy occlusion

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
  api/                 FastAPI backend (see CLAUDE.md)
  web/                 Next.js frontend
    app/               App Router pages
    components/        Controls, ResultCard, ThemeToggle, ui/* (shadcn)
    lib/api.ts         Backend contract + fetch helper
docs/                  Phase walkthroughs (1–6)
model/best.pt          YOLOv8 weights
demo-image/               Demo image
Dockerfile             Multi-stage build (node → python)
```

See `docs/phase-N-walkthrough.md` for student-friendly explanations of each phase.

## License

MIT.
