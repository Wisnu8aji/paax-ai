"""
Fase 2 P1 — kontrak paritas skema TKG (mirror vs core-engine kanonik).

Memuat core-engine/app/tkg/models.py langsung dari path file (BUKAN via
sys.path/import paket, supaya tidak tabrakan nama modul `app.tkg` dengan
punya document-intelligence sendiri) lalu membandingkan `model_fields` tiap
kelas terhadap mirror di app.perception.tkg.models.
"""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import pytest

from app.perception.tkg import models as mirror

_REPO_ROOT = Path(__file__).resolve().parents[3]
_CORE_ENGINE_MODELS = _REPO_ROOT / "services" / "core-engine" / "app" / "tkg" / "models.py"

_MODEL_NAMES = [
    "GridAxis", "GridSpan", "GridTotal", "Grid", "Level", "RebarSpec",
    "TypeRecord", "TkgTable", "RuasGrid", "ElementInstance", "Dimension",
    "SheetMeta", "Unclassified", "TkgSheet", "TkgDocument",
]


def _load_core_engine_models():
    spec = importlib.util.spec_from_file_location("core_engine_tkg_models_contract", _CORE_ENGINE_MODELS)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


@pytest.mark.skipif(not _CORE_ENGINE_MODELS.exists(), reason="core-engine tidak ditemukan di repo ini")
@pytest.mark.parametrize("name", _MODEL_NAMES)
def test_mirror_field_names_match_core_engine(name: str):
    core = _load_core_engine_models()
    core_cls = getattr(core, name)
    mirror_cls = getattr(mirror, name)

    core_fields = set(core_cls.model_fields.keys())
    mirror_fields = set(mirror_cls.model_fields.keys())
    assert mirror_fields == core_fields, f"{name}: mirror={mirror_fields} core={core_fields}"


def test_tkg_document_round_trip_matches_shape():
    doc = mirror.TkgDocument(
        prj_id="TEST",
        sheets=[
            mirror.TkgSheet(
                sheet_id="S01",
                jenis="denah",
                meta=mirror.SheetMeta(judul="Denah Uji"),
                grid=mirror.Grid(
                    sumbu_x=[mirror.GridAxis(label="A"), mirror.GridAxis(label="B")],
                    bentang_x=[mirror.GridSpan(dari="A", ke="B", nilai=4000)],
                ),
            )
        ],
    )
    dumped = doc.model_dump()
    assert dumped["prj_id"] == "TEST"
    assert dumped["sheets"][0]["grid"]["bentang_x"][0]["nilai"] == 4000
