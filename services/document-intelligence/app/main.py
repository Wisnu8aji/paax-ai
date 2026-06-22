from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api import health_routes, upload_routes, pdf_routes, excel_routes, drawing_routes

app = FastAPI(title="PAAX Document Intelligence", version="0.5.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_routes.router)
app.include_router(upload_routes.router)
app.include_router(pdf_routes.router)
app.include_router(excel_routes.router)
app.include_router(drawing_routes.router)
