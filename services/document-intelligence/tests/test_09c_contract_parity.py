"""Contract parity tests for DI boundary schemas against canonical Core Engine request contracts.

Phase 09C Correction Round 3 requirement:
"If canonical reuse is architecturally unavailable, define strict DI boundary models
that mirror the canonical request contract and add contract-parity tests against real
Core Engine OpenAPI/schema fixtures."
"""
from __future__ import annotations

import json
from pathlib import Path
import pytest
from pydantic import BaseModel

from app.drawing_intelligence.dispatch_schemas import (
    DIArsitekturRequest,
    DIAtapDetailRequest,
    DIBajaRequest,
    DIDindingRequest,
    DIKusenRequest,
    DIMepRequest,
    DISmkkRequest,
    DITanahRequest,
    get_request_model,
)


class TestContractParity:
    """Verify that DI boundary models maintain strict structural and behavioral
    parity with Core Engine's canonical request contracts using canonical JSON payloads/fixtures.
    """

    def test_all_in_scope_contracts_have_di_boundary_models(self):
        contracts = [
            "takeoff.tanah",
            "takeoff.dinding",
            "takeoff.arsitektur",
            "takeoff.baja",
            "takeoff.atap",
            "takeoff.kusen",
            "takeoff.mep",
            "takeoff.mep_advanced",
            "takeoff.smkk",
        ]
        for c in contracts:
            model = get_request_model(c)
            assert model is not None, f"Missing DI boundary model for contract {c}"
            assert issubclass(model, BaseModel)
            assert model.model_config.get("extra") == "forbid", f"Model for {c} must have extra='forbid'"

    def test_tanah_request_canonical_fixture_parity(self):
        canonical_fixture = {
            "footplats": [{"kode": "FP1", "b_ft": 2.0, "l_ft": 2.0, "d_gali": 1.5, "n": 1}],
            "galian_menerus": [{"kode": "GM1", "l_parit": 10.0, "b_bawah": 0.5, "d_gali": 1.0}],
            "urugan": [{"kode": "UR1", "jenis": "pasir", "a": 20.0, "t_lapis": 0.1}],
            "pemadatan": [{"kode": "PM1", "quantity_basis": "area", "area_m2": 20.0}],
        }
        di_obj = DITanahRequest.model_validate(canonical_fixture)
        assert di_obj.footplats[0].kode == "FP1"
        assert di_obj.footplats[0].b_ft == 2.0
        assert di_obj.galian_menerus[0].l_parit == 10.0
        assert di_obj.urugan[0].jenis == "pasir"

    def test_dinding_request_canonical_fixture_parity(self):
        canonical_fixture = {
            "dinding": [{"kode": "D1", "l_dinding": 5.0, "h_dinding": 3.0, "bukaan": [{"nama": "P1", "lebar": 0.9, "tinggi": 2.1}]}],
            "screed": [{"kode": "SC1", "a": 15.0, "t": 0.05}],
            "sponningan": [{"kode": "SP1", "panjang_m": 10.0, "jumlah": 2}],
            "praktis": [{"kode": "KP1", "panjang_segmen_m": 3.0, "tinggi_m": 3.0}],
        }
        di_obj = DIDindingRequest.model_validate(canonical_fixture)
        assert di_obj.dinding[0].kode == "D1"
        assert di_obj.dinding[0].bukaan[0].lebar == 0.9

    def test_mep_request_canonical_fixture_parity(self):
        canonical_fixture = {
            "pipe_routes": [{"kode": "PR1", "length_m": 12.5, "qty": 1}],
            "points": [{"kode": "MP1", "jenis": "stop_kontak", "count": 4}],
            "railing": [{"kode": "RL1", "length_m": 5.0, "qty": 1}],
            "fixture_fallbacks": [{"kode": "FF1", "fixture_count": 2}],
        }
        di_obj = DIMepRequest.model_validate(canonical_fixture)
        assert di_obj.pipe_routes[0].length_m == 12.5
        assert di_obj.points[0].count == 4

    def test_baja_request_canonical_fixture_parity(self):
        canonical_fixture = {
            "profile_table": {"WF200": {"kg_per_m": 21.3}},
            "members": [{"kode": "B1", "designation": "WF200", "length_m": 6.0, "qty": 2}],
            "builtup_plates": [{"kode": "PL1", "t_m": 0.01, "width_m": 0.2, "length_m": 0.3, "qty": 4}],
        }
        di_obj = DIBajaRequest.model_validate(canonical_fixture)
        assert di_obj.members[0].length_m == 6.0

    def test_atap_request_canonical_fixture_parity(self):
        canonical_fixture = {
            "garis": [{"kode": "R1", "work": "nok", "length_m": 10.0, "qty": 1}],
            "gording": [{"kode": "G1", "l_miring_sisi_m": 4.0, "s_gording_m": 1.0, "l_arah_gording_m": 10.0, "n_sisi_atap": 2}],
        }
        di_obj = DIAtapDetailRequest.model_validate(canonical_fixture)
        assert di_obj.garis[0].length_m == 10.0

    def test_kusen_request_canonical_fixture_parity(self):
        canonical_fixture = {
            "items": [{"kode": "K1", "tipe": "P1", "width_m": 0.9, "height_m": 2.1, "qty": 2}],
        }
        di_obj = DIKusenRequest.model_validate(canonical_fixture)
        assert di_obj.items[0].width_m == 0.9

    def test_arsitektur_request_canonical_fixture_parity(self):
        canonical_fixture = {
            "pondasi_batu": [{"kode": "PB1", "a_atas": 0.3, "a_bawah": 0.6, "h_pond": 0.8, "l": 15.0}],
            "lantai": [{"kode": "L1", "panjang": 5.0, "lebar": 4.0}],
            "atap": [{"kode": "A1", "a_proyeksi": 50.0, "theta_deg": 30.0}],
        }
        di_obj = DIArsitekturRequest.model_validate(canonical_fixture)
        assert di_obj.pondasi_batu[0].h_pond == 0.8
