"""Security helpers for file uploads in document-intelligence service.

Centralises:
  - filename sanitisation (path-traversal prevention)
  - PDF magic-byte validation
  - upload size-limit constant (shared across all upload endpoints)

No network calls, no AI calls — fully deterministic.
"""
from __future__ import annotations

import os
import re
from typing import Protocol

import fitz

# ── Upload size limit ────────────────────────────────────────────────────────
# 50 MB — referenced by upload_routes.py (was inline), dem_routes.py, and pdf_routes.py.
MAX_UPLOAD_BYTES: int = 50 * 1024 * 1024
MAX_PDF_PAGES: int = 500
MAX_RENDER_PIXELS: int = 80_000_000

# PDF magic bytes: every valid PDF starts with "%PDF-"
_PDF_MAGIC = b"%PDF-"


def sanitise_filename(raw: str | None) -> str:
    """Return a safe basename from *raw*, stripping path-traversal sequences.

    Rules:
      * Reject empty / None → returns "upload.bin"
      * Strip leading/trailing whitespace
      * Take only the final path component (basename) — kills "../" traversal
      * Remove any remaining ".." component
      * Replace characters outside [A-Za-z0-9._-] with "_"
      * Collapse multiple underscores/dots
      * Truncate at 200 characters

    Never raises; always returns a non-empty string.
    """
    if not raw:
        return "upload.bin"
    name = raw.strip()
    # Take basename regardless of platform separators
    name = os.path.basename(name.replace("\\", "/").replace("\\", os.sep))
    # Remove ".." components that survive basename on unusual inputs
    name = name.replace("..", "")
    # Allowlist: alphanumeric + safe punctuation
    name = re.sub(r"[^\w.\-]", "_", name)
    # Collapse multiple consecutive underscores/dots but keep extension dots
    name = re.sub(r"_{2,}", "_", name)
    name = re.sub(r"\.{2,}", ".", name)
    name = name.strip("._")
    if not name:
        return "upload.bin"
    return name[:200]


def validate_pdf_magic(data: bytes) -> bool:
    """Return True if *data* starts with the PDF magic bytes ('%PDF-').

    Validates only the first 5 bytes — does NOT fully parse the PDF.
    Use *before* writing to disk to reject non-PDF files masquerading as PDFs.
    """
    return data[:5] == _PDF_MAGIC


def check_upload_size(size: int, limit: int = MAX_UPLOAD_BYTES) -> bool:
    """Return True if *size* bytes is within the allowed *limit*."""
    return size <= limit


class MalwareScanner(Protocol):
    def scan(self, data: bytes, *, filename: str) -> bool: ...


def validate_pdf_policy(data: bytes, *, max_pages: int = MAX_PDF_PAGES, max_render_pixels: int = MAX_RENDER_PIXELS) -> int:
    """Parse before storage and fail closed for encrypted/unsafe render inputs."""
    try:
        document = fitz.open(stream=data, filetype="pdf")
    except Exception as exc:
        raise ValueError("invalid PDF document") from exc
    try:
        if document.needs_pass:
            raise ValueError("encrypted PDFs are not accepted")
        if document.page_count > max_pages:
            raise ValueError("PDF exceeds page limit")
        for page in document:
            rect = page.rect
            # 200 DPI is the fixed renderer default; validate the worst page.
            pixels = int(rect.width / 72 * 200) * int(rect.height / 72 * 200)
            if pixels > max_render_pixels:
                raise ValueError("PDF page exceeds render pixel limit")
        return document.page_count
    finally:
        document.close()


def scan_or_reject(scanner: MalwareScanner | None, data: bytes, *, filename: str) -> None:
    """No scanner configuration means reject unless explicitly allowed for local dev."""
    if scanner is None:
        if os.getenv("ALLOW_UNSCANNED_UPLOADS", "false").lower() not in {"1", "true", "yes"}:
            raise ValueError("malware scanner is unavailable")
        return
    if not scanner.scan(data, filename=filename):
        raise ValueError("malware scan rejected upload")
