"""
Demo AHSP library — realistic unit-price analysis data for common work items.

Based on SNI and Permen PUPR format.
"""

from __future__ import annotations

from app.domain.hsp.models import AHSPKomponen, AHSPRecipe, KomponenTipe


def get_ahsp_library() -> list[AHSPRecipe]:
    """Return a demo library of AHSP recipes."""
    return [
        # ── Pasangan bata ringan 10 cm ──────────────────────────
        AHSPRecipe(
            kode_analisa="SNI.6.1",
            uraian_pekerjaan="Pasangan bata ringan tebal 10 cm",
            satuan_pekerjaan="m²",
            komponen=[
                AHSPKomponen(
                    tipe=KomponenTipe.TENAGA,
                    uraian="Pekerja",
                    satuan="OH",
                    koefisien=0.30,
                    harga=120_000,
                ),
                AHSPKomponen(
                    tipe=KomponenTipe.TENAGA,
                    uraian="Tukang batu",
                    satuan="OH",
                    koefisien=0.10,
                    harga=150_000,
                ),
                AHSPKomponen(
                    tipe=KomponenTipe.TENAGA,
                    uraian="Kepala tukang",
                    satuan="OH",
                    koefisien=0.01,
                    harga=170_000,
                ),
                AHSPKomponen(
                    tipe=KomponenTipe.TENAGA,
                    uraian="Mandor",
                    satuan="OH",
                    koefisien=0.015,
                    harga=180_000,
                ),
                AHSPKomponen(
                    tipe=KomponenTipe.BAHAN,
                    uraian="Bata ringan 10×20×60 cm",
                    satuan="bh",
                    koefisien=8.50,
                    harga=8_500,
                ),
                AHSPKomponen(
                    tipe=KomponenTipe.BAHAN,
                    uraian="Mortar perekat bata ringan",
                    satuan="kg",
                    koefisien=3.50,
                    harga=3_200,
                ),
            ],
        ),
        # ── Plesteran 1 : 4 ────────────────────────────────────
        AHSPRecipe(
            kode_analisa="SNI.6.2",
            uraian_pekerjaan="Plesteran dinding 1:4 tebal 15 mm",
            satuan_pekerjaan="m²",
            komponen=[
                AHSPKomponen(
                    tipe=KomponenTipe.TENAGA,
                    uraian="Pekerja",
                    satuan="OH",
                    koefisien=0.30,
                    harga=120_000,
                ),
                AHSPKomponen(
                    tipe=KomponenTipe.TENAGA,
                    uraian="Tukang batu",
                    satuan="OH",
                    koefisien=0.15,
                    harga=150_000,
                ),
                AHSPKomponen(
                    tipe=KomponenTipe.TENAGA,
                    uraian="Kepala tukang",
                    satuan="OH",
                    koefisien=0.015,
                    harga=170_000,
                ),
                AHSPKomponen(
                    tipe=KomponenTipe.TENAGA,
                    uraian="Mandor",
                    satuan="OH",
                    koefisien=0.015,
                    harga=180_000,
                ),
                AHSPKomponen(
                    tipe=KomponenTipe.BAHAN,
                    uraian="Semen portland (50 kg)",
                    satuan="zak",
                    koefisien=0.183,
                    harga=72_000,
                ),
                AHSPKomponen(
                    tipe=KomponenTipe.BAHAN,
                    uraian="Pasir pasang",
                    satuan="m³",
                    koefisien=0.024,
                    harga=350_000,
                ),
            ],
        ),
        # ── Beton K-250 (kolom/balok) ──────────────────────────
        AHSPRecipe(
            kode_analisa="SNI.4.1",
            uraian_pekerjaan="Beton bertulang K-250 (kolom/balok)",
            satuan_pekerjaan="m³",
            komponen=[
                AHSPKomponen(
                    tipe=KomponenTipe.TENAGA,
                    uraian="Pekerja",
                    satuan="OH",
                    koefisien=1.65,
                    harga=120_000,
                ),
                AHSPKomponen(
                    tipe=KomponenTipe.TENAGA,
                    uraian="Tukang batu",
                    satuan="OH",
                    koefisien=0.275,
                    harga=150_000,
                ),
                AHSPKomponen(
                    tipe=KomponenTipe.TENAGA,
                    uraian="Kepala tukang",
                    satuan="OH",
                    koefisien=0.028,
                    harga=170_000,
                ),
                AHSPKomponen(
                    tipe=KomponenTipe.TENAGA,
                    uraian="Mandor",
                    satuan="OH",
                    koefisien=0.083,
                    harga=180_000,
                ),
                AHSPKomponen(
                    tipe=KomponenTipe.BAHAN,
                    uraian="Semen portland (50 kg)",
                    satuan="zak",
                    koefisien=8.00,
                    harga=72_000,
                ),
                AHSPKomponen(
                    tipe=KomponenTipe.BAHAN,
                    uraian="Pasir beton",
                    satuan="m³",
                    koefisien=0.52,
                    harga=400_000,
                ),
                AHSPKomponen(
                    tipe=KomponenTipe.BAHAN,
                    uraian="Kerikil / split",
                    satuan="m³",
                    koefisien=0.76,
                    harga=450_000,
                ),
                AHSPKomponen(
                    tipe=KomponenTipe.BAHAN,
                    uraian="Besi beton polos / ulir",
                    satuan="kg",
                    koefisien=150.0,
                    harga=14_000,
                ),
                AHSPKomponen(
                    tipe=KomponenTipe.BAHAN,
                    uraian="Kawat bendrat",
                    satuan="kg",
                    koefisien=2.25,
                    harga=25_000,
                ),
                AHSPKomponen(
                    tipe=KomponenTipe.ALAT,
                    uraian="Molen / concrete mixer",
                    satuan="jam",
                    koefisien=2.0,
                    harga=50_000,
                ),
                AHSPKomponen(
                    tipe=KomponenTipe.ALAT,
                    uraian="Vibrator beton",
                    satuan="jam",
                    koefisien=1.5,
                    harga=45_000,
                ),
            ],
        ),
        # ── Galian tanah biasa ─────────────────────────────────
        AHSPRecipe(
            kode_analisa="SNI.2.1",
            uraian_pekerjaan="Galian tanah biasa sedalam 1 m",
            satuan_pekerjaan="m³",
            komponen=[
                AHSPKomponen(
                    tipe=KomponenTipe.TENAGA,
                    uraian="Pekerja",
                    satuan="OH",
                    koefisien=0.75,
                    harga=120_000,
                ),
                AHSPKomponen(
                    tipe=KomponenTipe.TENAGA,
                    uraian="Mandor",
                    satuan="OH",
                    koefisien=0.025,
                    harga=180_000,
                ),
            ],
        ),
        # ── Pemasangan keramik lantai 60×60 ────────────────────
        AHSPRecipe(
            kode_analisa="SNI.7.1",
            uraian_pekerjaan="Pemasangan keramik lantai 60×60 cm",
            satuan_pekerjaan="m²",
            komponen=[
                AHSPKomponen(
                    tipe=KomponenTipe.TENAGA,
                    uraian="Pekerja",
                    satuan="OH",
                    koefisien=0.35,
                    harga=120_000,
                ),
                AHSPKomponen(
                    tipe=KomponenTipe.TENAGA,
                    uraian="Tukang batu",
                    satuan="OH",
                    koefisien=0.12,
                    harga=150_000,
                ),
                AHSPKomponen(
                    tipe=KomponenTipe.TENAGA,
                    uraian="Kepala tukang",
                    satuan="OH",
                    koefisien=0.012,
                    harga=170_000,
                ),
                AHSPKomponen(
                    tipe=KomponenTipe.TENAGA,
                    uraian="Mandor",
                    satuan="OH",
                    koefisien=0.018,
                    harga=180_000,
                ),
                AHSPKomponen(
                    tipe=KomponenTipe.BAHAN,
                    uraian="Keramik 60×60 cm",
                    satuan="m²",
                    koefisien=1.05,
                    harga=95_000,
                ),
                AHSPKomponen(
                    tipe=KomponenTipe.BAHAN,
                    uraian="Semen portland",
                    satuan="zak",
                    koefisien=0.20,
                    harga=72_000,
                ),
                AHSPKomponen(
                    tipe=KomponenTipe.BAHAN,
                    uraian="Pasir pasang",
                    satuan="m³",
                    koefisien=0.045,
                    harga=350_000,
                ),
            ],
        ),
        # ── Pengecatan dinding interior ────────────────────────
        AHSPRecipe(
            kode_analisa="SNI.9.1",
            uraian_pekerjaan="Pengecatan dinding interior",
            satuan_pekerjaan="m²",
            komponen=[
                AHSPKomponen(
                    tipe=KomponenTipe.TENAGA,
                    uraian="Pekerja",
                    satuan="OH",
                    koefisien=0.063,
                    harga=120_000,
                ),
                AHSPKomponen(
                    tipe=KomponenTipe.TENAGA,
                    uraian="Tukang cat",
                    satuan="OH",
                    koefisien=0.063,
                    harga=150_000,
                ),
                AHSPKomponen(
                    tipe=KomponenTipe.TENAGA,
                    uraian="Kepala tukang",
                    satuan="OH",
                    koefisien=0.006,
                    harga=170_000,
                ),
                AHSPKomponen(
                    tipe=KomponenTipe.TENAGA,
                    uraian="Mandor",
                    satuan="OH",
                    koefisien=0.003,
                    harga=180_000,
                ),
                AHSPKomponen(
                    tipe=KomponenTipe.BAHAN,
                    uraian="Cat tembok interior (2.5 L)",
                    satuan="kaleng",
                    koefisien=0.10,
                    harga=85_000,
                ),
                AHSPKomponen(
                    tipe=KomponenTipe.BAHAN,
                    uraian="Plamir tembok",
                    satuan="kg",
                    koefisien=0.10,
                    harga=18_000,
                ),
                AHSPKomponen(
                    tipe=KomponenTipe.ALAT,
                    uraian="Roll cat + kuas",
                    satuan="set",
                    koefisien=0.01,
                    harga=50_000,
                ),
            ],
        ),
    ]
