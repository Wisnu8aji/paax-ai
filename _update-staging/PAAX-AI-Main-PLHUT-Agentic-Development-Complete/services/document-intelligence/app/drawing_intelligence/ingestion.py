from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile
from typing import Literal

import fitz

from .models import DrawingSourceManifest


InputKind = Literal["pdf", "dwg", "dxf", "png", "jpg", "jpeg", "tiff", "unknown"]


class DrawingInputError(ValueError):
    pass


class CadConversionUnavailable(DrawingInputError):
    pass


def detect_input_kind(filename: str, content: bytes) -> InputKind:
    suffix = Path(filename).suffix.lower().lstrip(".")
    if content.startswith(b"%PDF-"):
        return "pdf"
    if content.startswith(b"AC10") or suffix == "dwg":
        return "dwg"
    if suffix == "dxf" or content[:32].lstrip().startswith(b"0") and b"SECTION" in content[:512]:
        return "dxf"
    if content.startswith(b"\x89PNG\r\n\x1a\n") or suffix == "png":
        return "png"
    if content.startswith(b"\xff\xd8\xff") or suffix in {"jpg", "jpeg"}:
        return "jpeg" if suffix == "jpeg" else "jpg"
    if content.startswith((b"II*\x00", b"MM\x00*")) or suffix in {"tif", "tiff"}:
        return "tiff"
    return "unknown"


def prepare_pdf_bytes(content: bytes, filename: str) -> tuple[bytes, InputKind, list[str]]:
    """Return a PDF representation while preserving the original modality.

    PDF and raster conversion are local and deterministic. DWG/DXF require an
    explicitly configured converter; the service fails closed when absent and
    never pretends CAD support succeeded.
    """
    kind = detect_input_kind(filename, content)
    if kind == "pdf":
        return content, kind, []
    if kind in {"png", "jpg", "jpeg", "tiff"}:
        try:
            image = fitz.open(stream=content, filetype=kind)
            pdf = image.convert_to_pdf()
            image.close()
        except Exception as exc:
            raise DrawingInputError(f"invalid {kind.upper()} drawing image: {exc}") from exc
        return pdf, kind, ["raster image was wrapped as a one-page PDF; OCR/review may be required"]
    if kind in {"dwg", "dxf"}:
        return _convert_cad(content, filename, kind), kind, [f"{kind.upper()} converted to PDF by configured local converter"]
    raise DrawingInputError("unsupported drawing format; accepted: PDF, DWG, DXF, PNG, JPG, TIFF")


def build_source_manifest(
    *, source_bytes: bytes, processed_pdf_bytes: bytes, filename: str,
    input_kind: InputKind, lineage_notes: list[str],
) -> DrawingSourceManifest:
    encrypted = False
    repaired = False
    page_count = 0
    try:
        with fitz.open(stream=processed_pdf_bytes, filetype="pdf") as document:
            encrypted = bool(document.needs_pass)
            repaired = bool(getattr(document, "is_repaired", False))
            page_count = document.page_count
    except Exception as exc:
        raise DrawingInputError(f"processed drawing is not a readable PDF: {exc}") from exc
    if encrypted:
        raise DrawingInputError("encrypted/password-protected PDF must be unlocked before analysis")
    notes = list(lineage_notes)
    if repaired:
        notes.append("PDF cross-reference structure was repaired by the parser; source should be reviewed")
    return DrawingSourceManifest(
        original_filename=Path(filename).name,
        input_kind=input_kind,
        source_sha256=hashlib.sha256(source_bytes).hexdigest(),
        processed_pdf_sha256=hashlib.sha256(processed_pdf_bytes).hexdigest(),
        source_size_bytes=len(source_bytes),
        processed_size_bytes=len(processed_pdf_bytes),
        page_count=page_count,
        converted_to_pdf=input_kind != "pdf",
        encrypted=encrypted,
        repaired_pdf=repaired,
        security_status="accepted",
        lineage_notes=notes,
    )


def _convert_cad(content: bytes, filename: str, kind: InputKind) -> bytes:
    command_json = os.environ.get("PAAX_CAD_TO_PDF_COMMAND_JSON", "").strip()
    if not command_json:
        raise CadConversionUnavailable(
            f"{kind.upper()} input requires PAAX_CAD_TO_PDF_COMMAND_JSON; no converter is configured"
        )
    try:
        template = json.loads(command_json)
        if not isinstance(template, list) or not template or not all(isinstance(value, str) for value in template):
            raise ValueError
    except (json.JSONDecodeError, ValueError) as exc:
        raise CadConversionUnavailable("PAAX_CAD_TO_PDF_COMMAND_JSON must be a JSON string array") from exc

    with tempfile.TemporaryDirectory(prefix="paax-cad-") as directory:
        root = Path(directory)
        input_path = root / Path(filename).name
        output_path = root / f"{input_path.stem}.pdf"
        input_path.write_bytes(content)
        command = [value.format(input=str(input_path), output=str(output_path), workdir=str(root)) for value in template]
        try:
            completed = subprocess.run(
                command,
                cwd=root,
                check=False,
                capture_output=True,
                text=True,
                timeout=180,
                shell=False,
            )
        except (OSError, subprocess.TimeoutExpired) as exc:
            raise CadConversionUnavailable(f"CAD conversion could not run: {exc}") from exc
        if completed.returncode != 0 or not output_path.is_file():
            detail = (completed.stderr or completed.stdout or "converter produced no PDF").strip()[-1000:]
            raise CadConversionUnavailable(f"CAD conversion failed: {detail}")
        pdf = output_path.read_bytes()
        if not pdf.startswith(b"%PDF-"):
            raise CadConversionUnavailable("CAD converter output is not a valid PDF")
        return pdf
