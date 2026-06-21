"""
RAB validators — deterministic checks on items and groups.

These are rule-based checks, NOT LLM-generated.
"""

from __future__ import annotations

from app.domain.rab.models import (
    KategoriPekerjaan,
    RABGroup,
    RABItem,
    RABWarning,
    Satuan,
)

# ── Allowed units per category ──────────────────────────────────────────────

_ALLOWED_UNITS: dict[KategoriPekerjaan, set[Satuan]] = {
    KategoriPekerjaan.PERSIAPAN: {Satuan.LS, Satuan.M1, Satuan.M2},
    KategoriPekerjaan.TANAH: {Satuan.M3, Satuan.M2},
    KategoriPekerjaan.PONDASI: {Satuan.M3, Satuan.M1, Satuan.M2},
    KategoriPekerjaan.STRUKTUR: {Satuan.M3, Satuan.M2, Satuan.KG},
    KategoriPekerjaan.DINDING: {Satuan.M2, Satuan.M1},
    KategoriPekerjaan.LANTAI: {Satuan.M2},
    KategoriPekerjaan.ATAP: {Satuan.M2, Satuan.M1, Satuan.BH},
    KategoriPekerjaan.PINTU_JENDELA: {Satuan.UNIT, Satuan.BH, Satuan.SET},
    KategoriPekerjaan.PLAFON: {Satuan.M2},
    KategoriPekerjaan.SANITASI: {Satuan.TITIK, Satuan.UNIT, Satuan.BH, Satuan.M1},
    KategoriPekerjaan.MEP: {Satuan.TITIK, Satuan.UNIT, Satuan.BH, Satuan.M1, Satuan.SET},
    KategoriPekerjaan.FINISHING: {Satuan.M2, Satuan.M1},
    KategoriPekerjaan.LUAR: {Satuan.M2, Satuan.M1, Satuan.M3, Satuan.UNIT},
}

# ── Price range per category (IDR) ──────────────────────────────────────────

_PRICE_RANGE: dict[KategoriPekerjaan, tuple[float, float]] = {
    KategoriPekerjaan.PERSIAPAN: (10_000, 50_000_000),
    KategoriPekerjaan.TANAH: (30_000, 500_000),
    KategoriPekerjaan.PONDASI: (500_000, 5_000_000),
    KategoriPekerjaan.STRUKTUR: (1_000_000, 15_000_000),
    KategoriPekerjaan.DINDING: (50_000, 500_000),
    KategoriPekerjaan.LANTAI: (100_000, 1_000_000),
    KategoriPekerjaan.ATAP: (100_000, 1_200_000),
    KategoriPekerjaan.PINTU_JENDELA: (500_000, 15_000_000),
    KategoriPekerjaan.PLAFON: (50_000, 300_000),
    KategoriPekerjaan.SANITASI: (50_000, 10_000_000),
    KategoriPekerjaan.MEP: (50_000, 10_000_000),
    KategoriPekerjaan.FINISHING: (20_000, 200_000),
    KategoriPekerjaan.LUAR: (50_000, 1_000_000),
}


def validate_unit(item: RABItem) -> RABWarning | None:
    """Check that the item's unit is valid for its category."""
    allowed = _ALLOWED_UNITS.get(item.kategori)
    if allowed and item.satuan not in allowed:
        return RABWarning(
            severity="error",
            code="UNIT_MISMATCH",
            message=(
                f"Satuan '{item.satuan.value}' tidak lazim untuk kategori "
                f"'{item.kategori.value}'. Satuan yang diizinkan: "
                f"{', '.join(s.value for s in allowed)}"
            ),
            item_id=item.id,
            suggestion=f"Gunakan salah satu: {', '.join(s.value for s in allowed)}",
        )
    return None


def validate_price_range(item: RABItem) -> RABWarning | None:
    """Check that the unit price is within a reasonable range for the category."""
    price_range = _PRICE_RANGE.get(item.kategori)
    if not price_range:
        return None

    lo, hi = price_range
    if item.harga_satuan < lo:
        return RABWarning(
            severity="warning",
            code="PRICE_TOO_LOW",
            message=(
                f"Harga satuan Rp {item.harga_satuan:,.0f} untuk '{item.uraian}' "
                f"di bawah batas wajar (Rp {lo:,.0f})"
            ),
            item_id=item.id,
            suggestion=f"Periksa kembali harga satuan. Range wajar: Rp {lo:,.0f} – Rp {hi:,.0f}",
        )
    if item.harga_satuan > hi:
        return RABWarning(
            severity="warning",
            code="PRICE_TOO_HIGH",
            message=(
                f"Harga satuan Rp {item.harga_satuan:,.0f} untuk '{item.uraian}' "
                f"di atas batas wajar (Rp {hi:,.0f})"
            ),
            item_id=item.id,
            suggestion=f"Periksa kembali harga satuan. Range wajar: Rp {lo:,.0f} – Rp {hi:,.0f}",
        )
    return None


def validate_volume(item: RABItem) -> RABWarning | None:
    """Check that the volume is positive and not absurdly high."""
    if item.volume <= 0:
        return RABWarning(
            severity="error",
            code="VOLUME_ZERO_OR_NEGATIVE",
            message=f"Volume item '{item.uraian}' harus > 0, ditemukan {item.volume}",
            item_id=item.id,
        )
    if item.volume > 100_000:
        return RABWarning(
            severity="warning",
            code="VOLUME_VERY_HIGH",
            message=f"Volume item '{item.uraian}' sangat besar ({item.volume:,.2f}). Harap periksa.",
            item_id=item.id,
        )
    return None


def validate_rab_items(groups: list[RABGroup]) -> list[RABWarning]:
    """Run all item-level validations across every group."""
    warnings: list[RABWarning] = []
    for group in groups:
        for item in group.items:
            for validator in (validate_unit, validate_price_range, validate_volume):
                w = validator(item)
                if w:
                    warnings.append(w)
    return warnings
