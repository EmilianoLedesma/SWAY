import os

UPLOAD_DIR = os.getenv("UPLOAD_DIR", "uploads")
AVISTAMIENTOS_UPLOAD_DIR = os.path.join(UPLOAD_DIR, "avistamientos")

os.makedirs(AVISTAMIENTOS_UPLOAD_DIR, exist_ok=True)
