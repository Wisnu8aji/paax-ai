"""
RAB warning detectors — identify missing items, abnormal volumes, and price outliers.
"""

from __future__ import annotations

from app.domain.rab.models import (
    KategoriPekerjaan,
    RABGroup,
    RABWarning,
)

# ── Required categories for a typical residential project ───────────────────

_REQUIRED_CATEGORIES: set[KategoriPekerjaan] = {
    KategoriPekerjaan.PERSIAPAN,
    KategoriPekerjaan.TANAH,
    KategoriPekerjaan.PONDASI,
    KategoriPekerjaan.STRUKTUR,
    KategoriPekerjaan.DINDING,
    KategoriPekerjaan.LANTAI,
    KategoriPekerjaan.ATAP,
    KategoriPekerjaan.SANITASI,
    KategoriPekerjaan.MEP,
}

# ── Expected proportion bounds (lo, hi) ─────────────────────────────────────

_EXPECTED_PROPORTION: dict[KategoriPekerjaan, tuple[float, float]] = {
    KategoriPekerjaan.STRUKTUR: (0.15, 0.40),
    KategoriPekerjaan.PONDASI: (0.06, 0.18),
    KategoriPekerjaan.ATAP: (0.05, 0.15),
    KategoriPekerjaan.FINISHING: (0.02, 0.10),
}


def detect_missing_categories(groups: list[RABGroup]) -> list[RABWarning]:
    """Warn if required work categories are absent."""
    present = {g.kategori for g in groups}
    missing = _REQUIRED_CATEGORIES - present
    return [
        RABWarning(
            severity="warning",
            code="MISSING_CATEGORY",
            message=f"Kategori pekerjaan '{k.value}' tidak ditemukan dalam RAB.",
            suggestion="Tambahkan divisi ini untuk RAB yang lengkap.",
        )
        for k in sorted(missing, key=lambda x: x.value)
    ]


def detect_proportion_anomalies(groups: list[RABGroup]) -> list[RABWarning]:
    """Warn if a division's share of total cost is outside expected bounds."""
    total = sum(g.subtotal for g in groups)
    if total <= 0:
        return []

    warnings: list[RABWarning] = []
    for group in groups:
        bounds = _EXPECTED_PROPORTION.get(group.kategori)
        if not bounds:
            continue
        share = group.subtotal / total
        lo, hi = bounds
        if share < lo:
            warnings.append(RABWarning(
                severity="warning",
                code="PROPORTION_LOW",
                message=(
                    f"Proporsi '{group.nama}' hanya {share:.1%} dari total, "
                    f"di bawah batas normal ({lo:.0%}–{hi:.0%})."
                ),
                suggestion="Volume atau harga satuan mungkin terlalu rendah.",
            ))
        elif share > hi:
            warnings.append(RABWarning(
                severity="warning",
                code="PROPORTION_HIGH",
                message=(
                    f"Proporsi '{group.nama}' mencapai {share:.1%} dari total, "
                    f"di atas batas normal ({lo:.0%}–{hi:.0%})."
                ),
                suggestion="Periksa volume dan harga satuan divisi ini.",
            ))
    return warnings


def detect_empty_groups(groups: list[RABGroup]) -> list[RABWarning]:
    """Warn if a group has no items."""
    return [
        RABWarning(
            severity="info",
            code="EMPTY_GROUP",
            message=f"Divisi '{g.nama}' tidak memiliki item pekerjaan.",
        )
        for g in groups if len(g.items) == 0
    ]


def generate_all_warnings(groups: list[RABGroup]) -> list[RABWarning]:
    """Run all warning detectors."""
    warnings: list[RABWarning] = []
    warnings.extend(detect_missing_categories(groups))
    warnings.extend(detect_proportion_anomalies(groups))
    warnings.extend(detect_empty_groups(groups))
    return warnings
