from fastapi import FastAPI
from app.api import health_routes, upload_routes, pdf_routes, excel_routes, drawing_routes

app = FastAPI(title="PAAX Document Intelligence", version="0.3.0")

app.include_router(health_routes.router)
app.include_router(upload_routes.router)
app.include_router(pdf_routes.router)
app.include_router(excel_routes.router)
app.include_router(drawing_routes.router)
