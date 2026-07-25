"""
Golden anchor HSP — engine UMUM vs RAB profesional NYATA (Fase 0a, brain TXT03 §6 T-04).

Sumber kunci jawaban: `rab gedung plhut surakarta ALFA.xlsx` (RAB manual asli
Gedung PLHUT Surakarta, TA 2024), sheet AHS — 32 analisa harga satuan pekerjaan
lengkap dgn koefisien + harga resource + tarif Overhead&Profit per analisa, dan
`expected_hsp` = HSP final (baris F) yang dihitung estimator profesional.

Yang diuji = ENGINE UMUM `compute_hsp()` (dipakai proyek apa pun) — bukan template
PLHUT. PLHUT hanya kunci jawaban di tests/fixtures/ (prinsip §0.1 roadmap
PAAX_ROADMAP_GAMBAR_KE_RAB_2026-07-03: fixture uji, BUKAN data/template sistem).

Rumus kanonik (SAYA.md §5): HSP = (bahan + upah + alat) x (1 + overhead_profit).
Terverifikasi 32/32 saat fixture dibuat.
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.rab.models import AHSPItem, Component, ResourcePrice
from app.rab.rab import compute_hsp

FIXTURE = Path(__file__).parent / "fixtures" / "plhut" / "ahs_golden.json"


def _load() -> dict:
    return json.loads(FIXTURE.read_text(encoding="utf-8"))


def _price_book(doc: dict) -> dict[str, ResourcePrice]:
    return {
        r["code"]: ResourcePrice(
            code=r["code"], name=r["name"], category=r["category"],
            unit=r["unit"], price=r["price"],
        )
        for r in doc["resources"]
    }


def _item(analysis: dict) -> AHSPItem:
    return AHSPItem(
        code=analysis["code"],
        name=analysis["name"],
        unit=analysis["unit"],
        overhead_profit=analysis["overhead_profit"],
        components=[
            Component(
                resource_code=c["resource_code"],
                category=c["category"],
                coefficient=c["coefficient"],
            )
            for c in analysis["components"]
        ],
    )


_DOC = _load()
_PRICE_BOOK = _price_book(_DOC)
_ANALYSES = _DOC["analyses"]


def test_fixture_terisi_32_analisa():
    assert _DOC["n_analyses"] == 32
    assert len(_ANALYSES) == 32
    assert len(_PRICE_BOOK) >= 32  # resource lokal per-analisa


@pytest.mark.parametrize("analysis", _ANALYSES, ids=[a["code"] for a in _ANALYSES])
def test_engine_hsp_reproduksi_hsp_profesional(analysis: dict):
    """Engine UMUM harus mereproduksi HSP profesional ALFA per analisa.

    Toleransi ketat = max(1 rupiah, 0.5%) untuk menyerap pembulatan; realitanya
    nyaris eksak (engine (A+B+C)x(1+OP) == baris F ALFA).
    """
    hsp = compute_hsp(_item(analysis), _PRICE_BOOK).hsp
    expected = analysis["expected_hsp"]
    assert abs(hsp - expected) <= max(1.0, 0.005 * expected), (
        f"{analysis['code']} {analysis['name']}: engine={hsp} expected={expected}"
    )


def test_semua_32_analisa_lolos_agregat():
    lolos = 0
    for a in _ANALYSES:
        hsp = compute_hsp(_item(a), _PRICE_BOOK).hsp
        if abs(hsp - a["expected_hsp"]) <= max(1.0, 0.005 * a["expected_hsp"]):
            lolos += 1
    assert lolos == 32, f"hanya {lolos}/32 analisa direproduksi engine"
