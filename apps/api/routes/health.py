from fastapi import APIRouter

from apps.api.config import MODEL_PATH
from apps.api.schemas import HealthResponse
from apps.api.services.model import model_status

router = APIRouter()


@router.get("/api/health", response_model=HealthResponse)
def health() -> HealthResponse:
    loaded, error = model_status()
    return HealthResponse(model_loaded=loaded, model_path=str(MODEL_PATH), error=error)
