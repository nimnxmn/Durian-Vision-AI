from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from apps.api.config import STATIC_DIR
from apps.api.routes import detect, health
from apps.api.services.model import warmup


@asynccontextmanager
async def lifespan(_app: FastAPI):
    warmup()
    yield


app = FastAPI(title="DurianVision AI", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(detect.router)


if STATIC_DIR.exists():
    # Serve the Next.js static export. Mount last so /api/* routes win.
    app.mount(
        "/",
        StaticFiles(directory=STATIC_DIR, html=True),
        name="static",
    )
else:
    # Dev mode: no built frontend. Fall back to a JSON landing page.
    @app.get("/")
    def root() -> JSONResponse:
        return JSONResponse(
            {
                "name": "DurianVision AI",
                "docs": "/docs",
                "health": "/api/health",
                "frontend": "not built (run `npm run build` in apps/web)",
            }
        )


@app.exception_handler(404)
async def spa_fallback(request, exc):
    # When the static frontend is mounted, the StaticFiles handler already
    # returns the right thing for assets and falls back to index.html for /.
    # For deep links (e.g. /about) we serve index.html so client-side routing
    # can pick up the path. API 404s still surface as JSON.
    if request.url.path.startswith("/api/"):
        return JSONResponse({"detail": "Not Found"}, status_code=404)
    index = STATIC_DIR / "index.html"
    if index.exists():
        return FileResponse(index)
    return JSONResponse({"detail": "Not Found"}, status_code=404)
