# syntax=docker/dockerfile:1.7

# ---------- Stage 1: build Next.js static export ----------
FROM node:20-alpine AS web
WORKDIR /app/apps/web

# Install deps using the lockfile for reproducibility.
COPY apps/web/package.json apps/web/package-lock.json ./
RUN npm ci

# Copy source and build. The build emits to apps/web/out (output: "export").
COPY apps/web/ ./
RUN npm run build

# ---------- Stage 2: Python API + bundled static frontend ----------
FROM python:3.11-slim AS runtime
WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PORT=7860

# OpenCV / ultralytics need a few system libs at runtime.
RUN apt-get update && apt-get install -y --no-install-recommends \
        libglib2.0-0 libsm6 libxext6 libxrender1 libgl1 libheif1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install -r requirements.txt

# Backend source + model weights.
COPY apps/api ./apps/api
COPY model ./model

# Built frontend from stage 1.
COPY --from=web /app/apps/web/out ./apps/web/out

EXPOSE 7860

# Spaces injects PORT=7860; we honor it so the same image runs locally too.
CMD ["sh", "-c", "uvicorn apps.api.main:app --host 0.0.0.0 --port ${PORT:-7860}"]
