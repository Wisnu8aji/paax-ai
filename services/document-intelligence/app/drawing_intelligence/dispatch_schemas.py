from __future__ import annotations

import math
from typing import Any, Literal, Optional
from pydantic import BaseModel, Field, field_validator, model_validator


def _require_finite(v: Any, field_name: str = "value") -> float:
    """Reject NaN, Infinity, and boolean-as-number."""
    if isinstance(v, bool):
        raise ValueError(f"{field_name}: boolean is not a valid numeric dimension")
    if not isinstance(v, (int, float)):
        raise ValueError(f"{field_name}: expected a number, got {type(v).__name__}")
    if not math.isfinite(float(v)):
        raise ValueError(f"{field_name}: must be a finite number (got {v!r})")
    return float(v)


def _positive_finite(v: Any, field_name: str = "value") -> float:
    val = _require_finite(v, field_name)
    if val <= 0:
        raise ValueError(f"{field_name}: must be positive (got {val!r})")
    return val


def _non_negative_finite(v: Any, field_name: str = "value") -> float:
    val = _require_finite(v, field_name)
    if val < 0:
        raise ValueError(f"{field_name}: must be non-negative (got {val!r})")
    return val


class _StrictBase(BaseModel):
    model_config = {"extra": "forbid", "strict": True}


# ─── §F Tanah ────────────────────────────────────────────────────────────────

class DIGalianFootplat(_StrictBase):
    kode: str
    b_ft: float  # lebar footplat (m), must be positive
    l_ft: float  # panjang footplat (m), must be positive
    d_gali: float  # kedalaman galian (m), must be positive
    n: int = Field(default=1, ge=1)
    v_struktur_tertanam_per_lubang: Optional[float] = None

    @field_validator("b_ft", "l_ft", "d_gali", mode="before")
    @classmethod
    def _positive(cls, v: Any) -> float:
        return _positive_finite(v, "dimension")

    @field_validator("v_struktur_tertanam_per_lubang", mode="before")
    @classmethod
    def _optional_nonneg(cls, v: Any) -> Optional[float]:
        if v is None:
            return None
        return _non_negative_finite(v, "v_struktur_tertanam_per_lubang")


class DIGalianMenerus(_StrictBase):
    kode: str
    l_parit: float
    b_bawah: float
    b_atas: Optional[float] = None
    d_gali: float

    @field_validator("l_parit", "b_bawah", "d_gali", mode="before")
    @classmethod
    def _positive(cls, v: Any) -> float:
        return _positive_finite(v, "dimension")


class DIUruganLapis(_StrictBase):
    kode: str
    jenis: Literal["pasir", "sirtu", "tanah"]
    a: float
    t_lapis: float
    material_sudah_padat: bool = False

    @field_validator("a", "t_lapis", mode="before")
    @classmethod
    def _positive(cls, v: Any) -> float:
        return _positive_finite(v, "dimension")


class DIPemadatan(_StrictBase):
    kode: str
    quantity_basis: Literal["area", "volume"]
    area_m2: Optional[float] = None
    volume_padat_m3: Optional[float] = None
    jarak_angkut_km: Optional[float] = None
    kelas_jarak_angkut: Optional[Literal["dekat", "sedang", "jauh"]] = None


class DITanahRequest(_StrictBase):
    footplats: list[DIGalianFootplat] = Field(default_factory=list)
    galian_menerus: list[DIGalianMenerus] = Field(default_factory=list)
    urugan: list[DIUruganLapis] = Field(default_factory=list)
    pemadatan: list[DIPemadatan] = Field(default_factory=list)

    @model_validator(mode="after")
    def _at_least_one_work_item(self) -> "DITanahRequest":
        total = len(self.footplats) + len(self.galian_menerus) + len(self.urugan) + len(self.pemadatan)
        if total == 0:
            raise ValueError("takeoff.tanah: no work items — at least one of footplats/galian_menerus/urugan/pemadatan required")
        return self


# ─── §E Dinding ──────────────────────────────────────────────────────────────

class DIBukaan(_StrictBase):
    nama: str
    lebar: float
    tinggi: float
    n: int = Field(default=1, ge=1)

    @field_validator("lebar", "tinggi", mode="before")
    @classmethod
    def _positive(cls, v: Any) -> float:
        return _positive_finite(v, "dimension")


class DIDindingBidang(_StrictBase):
    kode: str
    l_dinding: float
    h_dinding: float
    bukaan: list[DIBukaan] = Field(default_factory=list)
    plester_sisi: int = Field(default=0, ge=0, le=2)
    acian: bool = False
    cat: bool = False

    @field_validator("l_dinding", "h_dinding", mode="before")
    @classmethod
    def _positive(cls, v: Any) -> float:
        return _positive_finite(v, "dimension")


class DIScreedBidang(_StrictBase):
    kode: str
    a: float
    t: float

    @field_validator("a", "t", mode="before")
    @classmethod
    def _positive(cls, v: Any) -> float:
        return _positive_finite(v, "dimension")


class DISponninganLine(_StrictBase):
    kode: str
    panjang_m: float
    jumlah: int = Field(default=1, ge=1)

    @field_validator("panjang_m", mode="before")
    @classmethod
    def _positive(cls, v: Any) -> float:
        return _positive_finite(v, "panjang_m")


class DIPraktisPanel(_StrictBase):
    kode: str
    panjang_segmen_m: float
    tinggi_m: float
    luas_panel_m2: Optional[float] = None

    @field_validator("panjang_segmen_m", "tinggi_m", mode="before")
    @classmethod
    def _positive(cls, v: Any) -> float:
        return _positive_finite(v, "dimension")


class DIDindingRequest(_StrictBase):
    dinding: list[DIDindingBidang] = Field(default_factory=list)
    screed: list[DIScreedBidang] = Field(default_factory=list)
    sponningan: list[DISponninganLine] = Field(default_factory=list)
    praktis: list[DIPraktisPanel] = Field(default_factory=list)

    @model_validator(mode="after")
    def _at_least_one(self) -> "DIDindingRequest":
        total = len(self.dinding) + len(self.screed) + len(self.sponningan) + len(self.praktis)
        if total == 0:
            raise ValueError("takeoff.dinding: no work items required")
        return self


# ─── §G Arsitektur ───────────────────────────────────────────────────────────

class DIPondasiBatu(_StrictBase):
    kode: str
    a_atas: float
    a_bawah: float
    h_pond: float
    l: float

    @field_validator("a_atas", "a_bawah", "h_pond", "l", mode="before")
    @classmethod
    def _positive(cls, v: Any) -> float:
        return _positive_finite(v, "dimension")


class DIPenutupLantai(_StrictBase):
    kode: str
    panjang: float
    lebar: float
    lebar_pintu_total: float = 0.0
    plin: bool = True

    @field_validator("panjang", "lebar", mode="before")
    @classmethod
    def _positive(cls, v: Any) -> float:
        return _positive_finite(v, "dimension")


class DIAtapMiring(_StrictBase):
    kode: str
    a_proyeksi: float
    theta_deg: float

    @field_validator("a_proyeksi", mode="before")
    @classmethod
    def _positive(cls, v: Any) -> float:
        return _positive_finite(v, "a_proyeksi")

    @field_validator("theta_deg", mode="before")
    @classmethod
    def _valid_angle(cls, v: Any) -> float:
        v = _require_finite(v, "theta_deg")
        if not (0 < v < 90):
            raise ValueError(f"theta_deg must be between 0 and 90 degrees, got {v}")
        return v


class DIArsitekturRequest(_StrictBase):
    pondasi_batu: list[DIPondasiBatu] = Field(default_factory=list)
    lantai: list[DIPenutupLantai] = Field(default_factory=list)
    atap: list[DIAtapMiring] = Field(default_factory=list)
    aanstamping: list[dict] = Field(default_factory=list)
    keramik_dinding: list[dict] = Field(default_factory=list)
    plafon: list[dict] = Field(default_factory=list)
    waterproofing: list[dict] = Field(default_factory=list)

    @model_validator(mode="after")
    def _at_least_one(self) -> "DIArsitekturRequest":
        total = (len(self.pondasi_batu) + len(self.lantai) + len(self.atap)
                 + len(self.aanstamping) + len(self.keramik_dinding)
                 + len(self.plafon) + len(self.waterproofing))
        if total == 0:
            raise ValueError("takeoff.arsitektur: no work items required")
        return self


# ─── §G06/G14 Baja ───────────────────────────────────────────────────────────

class DIProfileData(_StrictBase):
    kg_per_m: float
    perimeter_m: Optional[float] = None

    @field_validator("kg_per_m", mode="before")
    @classmethod
    def _positive(cls, v: Any) -> float:
        return _positive_finite(v, "kg_per_m")


class DIBajaMember(_StrictBase):
    kode: str
    designation: str
    length_m: float
    qty: int = Field(default=1, ge=1)

    @field_validator("length_m", mode="before")
    @classmethod
    def _positive(cls, v: Any) -> float:
        return _positive_finite(v, "length_m")


class DIBuiltUpPlate(_StrictBase):
    kode: str
    t_m: float
    width_m: float
    length_m: float
    qty: int = Field(default=1, ge=1)

    @field_validator("t_m", "width_m", "length_m", mode="before")
    @classmethod
    def _positive(cls, v: Any) -> float:
        return _positive_finite(v, "dimension")


class DIBajaRequest(_StrictBase):
    profile_table: dict[str, DIProfileData] = Field(default_factory=dict)
    members: list[DIBajaMember] = Field(default_factory=list)
    builtup_plates: list[DIBuiltUpPlate] = Field(default_factory=list)
    paint_members: list[DIBajaMember] = Field(default_factory=list)

    @model_validator(mode="after")
    def _at_least_one(self) -> "DIBajaRequest":
        total = len(self.members) + len(self.builtup_plates) + len(self.paint_members)
        if total == 0 and not self.profile_table:
            raise ValueError("takeoff.baja: no work items required")
        return self


# ─── §G07/G08 Atap detail ────────────────────────────────────────────────────

class DIRoofLine(_StrictBase):
    kode: str
    work: Literal["nok", "lisplank", "talang"]
    length_m: float
    qty: int = Field(default=1, ge=1)

    @field_validator("length_m", mode="before")
    @classmethod
    def _positive(cls, v: Any) -> float:
        return _positive_finite(v, "length_m")


class DIGordingInput(_StrictBase):
    kode: str
    l_miring_sisi_m: float
    s_gording_m: float
    l_arah_gording_m: float
    n_sisi_atap: int = Field(default=1, ge=1)

    @field_validator("l_miring_sisi_m", "s_gording_m", "l_arah_gording_m", mode="before")
    @classmethod
    def _positive(cls, v: Any) -> float:
        return _positive_finite(v, "dimension")


class DIAtapDetailRequest(_StrictBase):
    garis: list[DIRoofLine] = Field(default_factory=list)
    gording: list[DIGordingInput] = Field(default_factory=list)
    trekstang: list[dict] = Field(default_factory=list)
    ikatan_angin: list[dict] = Field(default_factory=list)
    downpipes: list[dict] = Field(default_factory=list)

    @model_validator(mode="after")
    def _at_least_one(self) -> "DIAtapDetailRequest":
        total = len(self.garis) + len(self.gording) + len(self.trekstang) + len(self.ikatan_angin) + len(self.downpipes)
        if total == 0:
            raise ValueError("takeoff.atap: no work items required")
        return self


# ─── Kusen ───────────────────────────────────────────────────────────────────

class DIKusenScheduleItem(_StrictBase):
    kode: str
    tipe: str
    width_m: float
    height_m: float
    qty: int = Field(ge=1)
    qty_counted: Optional[int] = None
    hitung_kusen_perimeter: bool = True
    hitung_daun_area: bool = False
    hitung_kaca_area: bool = False

    @field_validator("width_m", "height_m", mode="before")
    @classmethod
    def _positive(cls, v: Any) -> float:
        return _positive_finite(v, "dimension")


class DIKusenRequest(_StrictBase):
    items: list[DIKusenScheduleItem] = Field(default_factory=list)

    @model_validator(mode="after")
    def _at_least_one(self) -> "DIKusenRequest":
        if not self.items:
            raise ValueError("takeoff.kusen: no work items required")
        return self


# ─── MEP ─────────────────────────────────────────────────────────────────────

class DIMepPoint(_StrictBase):
    kode: str
    jenis: str
    count: int = Field(ge=1)


class DIPipeRoute(_StrictBase):
    kode: str
    length_m: float
    qty: int = Field(default=1, ge=1)

    @field_validator("length_m", mode="before")
    @classmethod
    def _positive(cls, v: Any) -> float:
        return _positive_finite(v, "length_m")


class DIMepFixtureFallback(_StrictBase):
    kode: str
    fixture_count: int = Field(ge=1)


class DIRailingLine(_StrictBase):
    kode: str
    length_m: float
    qty: int = Field(default=1, ge=1)

    @field_validator("length_m", mode="before")
    @classmethod
    def _positive(cls, v: Any) -> float:
        return _positive_finite(v, "length_m")


class DIMepRequest(_StrictBase):
    railing: list[DIRailingLine] = Field(default_factory=list)
    points: list[DIMepPoint] = Field(default_factory=list)
    pipe_routes: list[DIPipeRoute] = Field(default_factory=list)
    fixture_fallbacks: list[DIMepFixtureFallback] = Field(default_factory=list)

    @model_validator(mode="after")
    def _at_least_one(self) -> "DIMepRequest":
        total = len(self.railing) + len(self.points) + len(self.pipe_routes) + len(self.fixture_fallbacks)
        if total == 0:
            raise ValueError("takeoff.mep/mep_advanced: no work items required")
        return self


# ─── SMKK ───────────────────────────────────────────────────────────────────

class DISmkkItem(_StrictBase):
    kode: str
    jumlah_ls: float = Field(ge=0)


class DISmkkRequest(_StrictBase):
    item_ls: list[DISmkkItem] = Field(default_factory=list)

    @model_validator(mode="after")
    def _at_least_one(self) -> "DISmkkRequest":
        if not self.item_ls:
            raise ValueError("takeoff.smkk: no work items required")
        return self


# ─── Registry: contract → DI request model ───────────────────────────────────

_REQUEST_MODEL_REGISTRY: dict[str, type[_StrictBase]] = {
    "takeoff.tanah": DITanahRequest,
    "takeoff.dinding": DIDindingRequest,
    "takeoff.arsitektur": DIArsitekturRequest,
    "takeoff.baja": DIBajaRequest,
    "takeoff.atap": DIAtapDetailRequest,
    "takeoff.kusen": DIKusenRequest,
    "takeoff.mep": DIMepRequest,
    "takeoff.mep_advanced": DIMepRequest,  # same schema, different endpoint
    "takeoff.smkk": DISmkkRequest,
}


def get_request_model(contract: str) -> type[_StrictBase] | None:
    """Return the DI boundary Pydantic model for the given engine_contract key."""
    return _REQUEST_MODEL_REGISTRY.get(contract)


# ─── Typed Response models ────────────────────────────────────────────────────

class DITakeoffLine(BaseModel):
    """Typed response item from /takeoff/* and /tkg/takeoff endpoints."""
    kode: str
    work: str
    quantity: Optional[float] = None  # None = needs_review; never fabricated
    unit: str
    formula: str = ""
    detail: str = ""
    needs_review: bool = False
    review_reason: Optional[str] = None
    rule_id: str = ""


class DIManualTakeoffResponse(BaseModel):
    """Typed response from manual-domain /takeoff/* endpoints."""
    domain: Optional[str] = None
    items: list[DITakeoffLine] = Field(default_factory=list)
    assumptions: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    engine_version: Optional[str] = None
    n_needs_review: Optional[int] = None

    model_config = {"extra": "allow"}  # tolerate additional engine fields


class DICalculationsResponse(BaseModel):
    """Typed response from /calculations endpoint."""
    status: str
    result: Optional[float] = None
    unit: Optional[str] = None
    calculation_id: Optional[str] = None
    calculation_type: Optional[str] = None
    formula: Optional[str] = None
    substituted_formula: Optional[str] = None
    warnings: list[str] = Field(default_factory=list)
    engine_version: Optional[str] = None
    project_id: Optional[str] = None

    model_config = {"extra": "allow"}
