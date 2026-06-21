import os
import pathlib

base_dir = 'services/document-intelligence'

files = {
    f'{base_dir}/app/__init__.py': '''# App init
''',
    f'{base_dir}/app/main.py': '''from fastapi import FastAPI
from app.api import health_routes, upload_routes, pdf_routes, excel_routes, drawing_routes

app = FastAPI(title="PAAX Document Intelligence", version="0.3.0")

app.include_router(health_routes.router)
app.include_router(upload_routes.router)
app.include_router(pdf_routes.router)
app.include_router(excel_routes.router)
app.include_router(drawing_routes.router)
''',
    f'{base_dir}/app/api/__init__.py': '''# API
''',
    f'{base_dir}/app/api/health_routes.py': '''from fastapi import APIRouter

router = APIRouter(prefix="/health", tags=["Health"])

@router.get("")
def health_check():
    return {"status": "ok", "service": "document-intelligence", "version": "0.3.0"}
''',
    f'{base_dir}/app/api/upload_routes.py': '''from fastapi import APIRouter, UploadFile, File

router = APIRouter(prefix="/upload", tags=["Upload"])

@router.post("")
async def upload_document(file: UploadFile = File(...)):
    return {"filename": file.filename, "status": "uploaded"}
''',
    f'{base_dir}/app/api/pdf_routes.py': '''from fastapi import APIRouter

router = APIRouter(prefix="/pdf", tags=["PDF"])

@router.post("/process")
async def process_pdf():
    return {"status": "processed"}
''',
    f'{base_dir}/app/api/excel_routes.py': '''from fastapi import APIRouter

router = APIRouter(prefix="/excel", tags=["Excel"])

@router.post("/process")
async def process_excel():
    return {"status": "processed"}
''',
    f'{base_dir}/app/api/drawing_routes.py': '''from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/drawing", tags=["Drawing"])

class DrawingProcessRequest(BaseModel):
    file_id: str

@router.post("/process")
async def process_drawing(req: DrawingProcessRequest):
    return {
        "status": "success",
        "classifications": ["denah", "potongan"],
        "elements_found": 15
    }
''',
    f'{base_dir}/app/processors/__init__.py': '''# Processors
''',
    f'{base_dir}/app/processors/pdf_renderer.py': '''class PdfRenderer:
    def process(self, file_path: str):
        return {"pages": 1}
''',
    f'{base_dir}/app/processors/ocr_extractor.py': '''class OcrExtractor:
    def process(self, image_data):
        return {"text": "Contoh teks OCR"}
''',
    f'{base_dir}/app/processors/excel_reader.py': '''class ExcelReader:
    def process(self, file_path: str):
        return {"rows": []}
''',
    f'{base_dir}/app/processors/drawing_classifier.py': '''class DrawingClassifier:
    def process(self, image_data):
        return {"class": "denah"}
''',
    f'{base_dir}/app/processors/image_preprocessor.py': '''class ImagePreprocessor:
    def process(self, image_data):
        return image_data
''',
    f'{base_dir}/app/outputs/__init__.py': '''# Outputs
''',
    f'{base_dir}/app/outputs/drawing_extraction_schema.py': '''from pydantic import BaseModel
from typing import List

class ElementCandidate(BaseModel):
    type: str
    confidence: float

class RoomCandidate(BaseModel):
    name: str
    area_m2: float

class DrawingExtraction(BaseModel):
    file_id: str
    elements: List[ElementCandidate]
    rooms: List[RoomCandidate]
''',
    f'{base_dir}/app/outputs/rab_import_schema.py': '''from pydantic import BaseModel
from typing import List

class QuantityCandidate(BaseModel):
    item_name: str
    quantity: float
    unit: str

class RabImport(BaseModel):
    project_id: str
    quantities: List[QuantityCandidate]
''',
    f'{base_dir}/tests/__init__.py': '''# Tests
''',
    f'{base_dir}/tests/test_health.py': '''from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_health_check():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "document-intelligence", "version": "0.3.0"}
''',
    f'{base_dir}/pyproject.toml': '''[tool.poetry]
name = "paax-document-intelligence"
version = "0.3.0"
description = "PAAX Document Intelligence"
authors = ["Basrenggg <basrenggg@example.com>"]

[tool.poetry.dependencies]
python = "^3.10"
fastapi = "*"
uvicorn = "*"
pydantic = "*"
python-multipart = "*"

[build-system]
requires = ["poetry-core>=1.0.0"]
build-backend = "poetry.core.masonry.api"
''',
    f'{base_dir}/Dockerfile': '''FROM python:3.10-slim
WORKDIR /app
COPY pyproject.toml .
RUN pip install poetry && poetry config virtualenvs.create false && poetry install --no-dev
COPY . .
CMD ["uvicorn", "app.main:app", "--host", "0.0.0", "--port", "8002"]
''',
    f'{base_dir}/README.md': '''# PAAX Document Intelligence
Python FastAPI service for processing PDFs, Excel, and classification of engineering drawings.
'''
}

for path, content in files.items():
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
