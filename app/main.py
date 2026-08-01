import os
from dotenv import load_dotenv
load_dotenv()
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from fastapi import Depends, Security
from fastapi.openapi.utils import get_openapi
from fastapi.staticfiles import StaticFiles
from app.config import UPLOAD_DIR
from app.routers import auth, colaboradores, especies, productos, pedidos, eventos, estadisticas, direcciones, catalogos
from app.security.rate_limit import limiter
from app.security.api_key import require_api_key

app = FastAPI(title="SWAY API", description="API de conservación marina SWAY", version="2.0.0")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

_raw_origins = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:5000,http://localhost:5173,http://127.0.0.1:5000,http://127.0.0.1:5173"
)
_origins = [o.strip() for o in _raw_origins.split(",")]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    body = await request.body()
    print(f"[422] URL: {request.url}")
    print(f"[422] Body: {body.decode()}")
    print(f"[422] Errors: {exc.errors()}")
    return JSONResponse(status_code=422, content={"detail": exc.errors()})

_api_key_dep = [Security(require_api_key)]

app.include_router(auth.router, dependencies=_api_key_dep)
app.include_router(colaboradores.router, dependencies=_api_key_dep)
app.include_router(especies.router, dependencies=_api_key_dep)
app.include_router(productos.router, dependencies=_api_key_dep)
app.include_router(pedidos.router, dependencies=_api_key_dep)
app.include_router(eventos.router, dependencies=_api_key_dep)
app.include_router(estadisticas.router, dependencies=_api_key_dep)
app.include_router(direcciones.router, dependencies=_api_key_dep)
app.include_router(catalogos.router, dependencies=_api_key_dep)

app.mount("/api/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")


def custom_openapi():
    if app.openapi_schema:
        return app.openapi_schema
    schema = get_openapi(
        title=app.title,
        version=app.version,
        description=app.description,
        routes=app.routes,
    )
    schemes = schema.setdefault("components", {}).setdefault("securitySchemes", {})
    schemes["ApiKeyAuth"] = {"type": "apiKey", "in": "header", "name": "x-api-key"}
    for path_item in schema.get("paths", {}).values():
        for operation in path_item.values():
            if isinstance(operation, dict):
                operation.setdefault("security", []).append({"ApiKeyAuth": []})
    app.openapi_schema = schema
    return schema

app.openapi = custom_openapi


@app.get("/")
def root():
    return {"message": "SWAY FastAPI v2.0", "docs": "/docs"}

@app.get("/health")
def health():
    return {"status": "ok"}
