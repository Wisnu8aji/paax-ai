from __future__ import annotations
import hashlib, json
from pathlib import Path
from typing import Literal
import fitz
from pydantic import BaseModel, Field

class ExternalBenchmarkSource(BaseModel):
    source_id: str
    name: str
    project_type: Literal['building','road','bridge','mep','water','synthetic']
    local_path: str
    sha256: str
    license: str
    source_url: str | None = None
    language: str = 'unknown'
    expected_pages: int = Field(gt=0)

class ExternalBenchmarkResult(BaseModel):
    source_id: str
    status: Literal['PASS','FAIL']
    pages: int
    pages_with_text: int
    native_text_characters: int
    native_drawing_groups: int
    failures: list[str]

def verify_external_source(source: ExternalBenchmarkSource, root: Path) -> ExternalBenchmarkResult:
    path=(root/source.local_path).resolve()
    failures=[]
    if root.resolve() not in path.parents and path != root.resolve(): failures.append('path escapes benchmark root')
    if not path.is_file(): return ExternalBenchmarkResult(source_id=source.source_id,status='FAIL',pages=0,pages_with_text=0,native_text_characters=0,native_drawing_groups=0,failures=['source file missing'])
    actual=hashlib.sha256(path.read_bytes()).hexdigest()
    if actual != source.sha256: failures.append('sha256 mismatch')
    try:
        doc=fitz.open(path); pages=len(doc); text_pages=0; chars=0; drawings=0
        for page in doc:
            text=page.get_text('text'); chars+=len(text); text_pages+=bool(text.strip()); drawings+=len(page.get_drawings())
        doc.close()
    except Exception as exc:
        return ExternalBenchmarkResult(source_id=source.source_id,status='FAIL',pages=0,pages_with_text=0,native_text_characters=0,native_drawing_groups=0,failures=failures+[f'pdf parse failed: {exc}'])
    if pages != source.expected_pages: failures.append(f'page count mismatch: expected {source.expected_pages}, got {pages}')
    if not source.license.strip(): failures.append('license is required')
    return ExternalBenchmarkResult(source_id=source.source_id,status='PASS' if not failures else 'FAIL',pages=pages,pages_with_text=text_pages,native_text_characters=chars,native_drawing_groups=drawings,failures=failures)

def load_external_manifest(path: Path) -> list[ExternalBenchmarkSource]:
    payload=json.loads(path.read_text(encoding='utf-8'))
    return [ExternalBenchmarkSource.model_validate(item) for item in payload.get('sources',[])]
