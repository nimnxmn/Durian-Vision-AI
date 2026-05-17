from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MODEL_PATH = ROOT / "model" / "best.pt"
STATIC_DIR = ROOT / "apps" / "web" / "out"

DEFAULT_CONF = 0.25
DEFAULT_IOU = 0.5
MAX_UPLOAD_BYTES = 20 * 1024 * 1024
MAX_LONG_EDGE = 640

ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/jpg"}
