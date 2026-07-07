from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api import health_routes, upload_routes, pdf_routes, excel_routes, drawing_routes, tkg_routes

import os

app = FastAPI(title="PAAX Document Intelligence", version="0.5.0")

allowed_origins_env = os.environ.get("ALLOWED_ORIGINS")
env_mode = os.environ.get("ENV", "development")

if allowed_origins_env:
    allowed_origins = [o.strip() for o in allowed_origins_env.split(",")]
elif env_mode == "development":
    allowed_origins = ["*"]
else:
    allowed_origins = [] # Strict by default if not dev and no env provided

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from fastapi import Depends
from .auth import get_current_user

app.include_router(health_routes.router)
app.include_router(upload_routes.router, dependencies=[Depends(get_current_user)])
app.include_router(pdf_routes.router, dependencies=[Depends(get_current_user)])
app.include_router(excel_routes.router, dependencies=[Depends(get_current_user)])
app.include_router(drawing_routes.router, dependencies=[Depends(get_current_user)])
app.include_router(tkg_routes.router, dependencies=[Depends(get_current_user)])
