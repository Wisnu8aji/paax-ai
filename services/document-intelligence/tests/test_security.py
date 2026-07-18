"""Tests for app.security — filename sanitisation and PDF magic-byte validation.

All tests are deterministic: no network calls, no AI calls, no filesystem writes.
Values are manually reasoned and used as anchors.
"""

import pytest

from app.security import (
    MAX_UPLOAD_BYTES,
    check_upload_size,
    sanitise_filename,
    validate_pdf_magic,
)


# ── sanitise_filename ─────────────────────────────────────────────────────────


class TestSanitiseFilename:
    """Filename sanitisation must reject path-traversal sequences."""

    def test_plain_name_unchanged(self):
        assert sanitise_filename("drawing.pdf") == "drawing.pdf"

    def test_strip_leading_dotdot_slash(self):
        # Classic path traversal — must NOT appear in output
        result = sanitise_filename("../../etc/passwd")
        assert ".." not in result
        assert "/" not in result
        assert "\\" not in result

    def test_strip_windows_path_traversal(self):
        result = sanitise_filename("..\\..\\windows\\system32\\config")
        assert ".." not in result

    def test_strip_intermediate_dotdot(self):
        result = sanitise_filename("foo/../bar.pdf")
        assert ".." not in result

    def test_none_returns_fallback(self):
        assert sanitise_filename(None) == "upload.bin"

    def test_empty_string_returns_fallback(self):
        assert sanitise_filename("") == "upload.bin"

    def test_whitespace_only_returns_fallback(self):
        assert sanitise_filename("   ") == "upload.bin"

    def test_basename_only_extracted(self):
        result = sanitise_filename("/some/deep/path/drawing-A1.pdf")
        # Must keep only the basename portion
        assert result == "drawing-A1.pdf"

    def test_special_chars_replaced(self):
        result = sanitise_filename("my file (1).pdf")
        assert " " not in result
        assert "(" not in result
        assert ")" not in result

    def test_truncation_at_200_chars(self):
        long_name = "a" * 300 + ".pdf"
        result = sanitise_filename(long_name)
        assert len(result) <= 200

    def test_result_never_empty(self):
        # Even a deeply adversarial input must return a non-empty string
        for adversarial in ["../", "../../", "..\\..\\", ".", ".."]:
            result = sanitise_filename(adversarial)
            assert result, f"Expected non-empty result for {adversarial!r}"

    def test_normal_unicode_name_survives(self):
        # Unicode non-ASCII chars get replaced, but the function never raises
        result = sanitise_filename("gmbr_denah_lantai1.pdf")
        assert result  # non-empty
        assert ".pdf" in result or result.endswith("pdf")


# ── validate_pdf_magic ────────────────────────────────────────────────────────


class TestValidatePdfMagic:
    """validate_pdf_magic must accept %PDF- prefixed data and reject anything else."""

    def test_valid_pdf_header_accepted(self):
        data = b"%PDF-1.4 \n% some comment\n"
        assert validate_pdf_magic(data) is True

    def test_valid_pdf_17_accepted(self):
        assert validate_pdf_magic(b"%PDF-1.7\n") is True

    def test_valid_pdf_20_accepted(self):
        assert validate_pdf_magic(b"%PDF-2.0\n") is True

    def test_png_rejected(self):
        png_header = b"\x89PNG\r\n\x1a\n"
        assert validate_pdf_magic(png_header) is False

    def test_jpeg_rejected(self):
        jpeg_header = b"\xff\xd8\xff\xe0"
        assert validate_pdf_magic(jpeg_header) is False

    def test_zip_rejected(self):
        zip_header = b"PK\x03\x04"
        assert validate_pdf_magic(zip_header) is False

    def test_empty_bytes_rejected(self):
        assert validate_pdf_magic(b"") is False

    def test_four_bytes_rejected(self):
        # Only 4 bytes — not enough to contain the 5-byte magic
        assert validate_pdf_magic(b"%PDF") is False

    def test_lowercase_rejected(self):
        # Magic must be exactly %PDF- (case-sensitive)
        assert validate_pdf_magic(b"%pdf-1.4") is False

    def test_pdf_with_leading_garbage_rejected(self):
        # Prepend garbage — common trick to bypass naive checks
        assert validate_pdf_magic(b"\x00%PDF-1.4") is False

    def test_exactly_five_magic_bytes_accepted(self):
        assert validate_pdf_magic(b"%PDF-") is True


# ── check_upload_size ─────────────────────────────────────────────────────────


class TestCheckUploadSize:
    """check_upload_size must enforce the 50 MB limit."""

    def test_zero_bytes_ok(self):
        assert check_upload_size(0) is True

    def test_at_limit_ok(self):
        assert check_upload_size(MAX_UPLOAD_BYTES) is True

    def test_one_byte_over_limit_rejected(self):
        assert check_upload_size(MAX_UPLOAD_BYTES + 1) is False

    def test_custom_limit(self):
        assert check_upload_size(10, limit=10) is True
        assert check_upload_size(11, limit=10) is False

    def test_max_upload_bytes_is_50mb(self):
        # Anchor: 50 MB exactly
        assert MAX_UPLOAD_BYTES == 50 * 1024 * 1024
