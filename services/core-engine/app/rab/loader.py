"""
PAAX Core Engine — Loader data AHSP & harga satuan.

Membaca semua file JSON di:
    <repo-root>/data/ahsp/*.json
    <repo-root>/data/harga-satuan/*.json
Override lokasi via env: PAAX_DATA_DIR.
"""
from __future__ import annotations
import json
import os
from pathlib import Path
from typing import Dict

from .models import AHSPItem, ResourcePrice, PriceBookVersion


def data_dir() -> Path:
    env = os.environ.get("PAAX_DATA_DIR")
    if env:
        return Path(env)
    # loader.py -> rab -> app -> core-engine -> services -> <repo-root>
    return Path(__file__).resolve().parents[4] / "data"


class DataStore:
    def __init__(self) -> None:
        self.ahsp: Dict[str, AHSPItem] = {}
        self.regions: Dict[str, list[PriceBookVersion]] = {}
        self.region_names: Dict[str, str] = {}

    def price_book(self, region_code: str, as_of_date: str | None = None) -> Dict[str, ResourcePrice]:
        versions = self.regions.get(region_code)
        if not versions:
            raise KeyError(
                f"Wilayah '{region_code}' tidak ditemukan. "
                f"Tersedia: {', '.join(self.regions) or '(kosong)'}"
            )
            
        if not as_of_date:
            # Return newest
            return max(versions, key=lambda v: v.effective_date).resources
            
        # Filter versions <= as_of_date
        valid = [v for v in versions if v.effective_date <= as_of_date]
        if not valid:
            oldest = min(versions, key=lambda v: v.effective_date).effective_date
            raise KeyError(
                f"Tidak ada versi buku harga yang berlaku pada atau sebelum '{as_of_date}'. "
                f"Versi tertua yang tersedia: {oldest}"
            )
            
        # Return newest among the valid ones
        return max(valid, key=lambda v: v.effective_date).resources


def load_data(base: Path | None = None) -> DataStore:
    store = DataStore()
    base = base or data_dir()

    ahsp_dir = base / "ahsp"
    if ahsp_dir.exists():
        for f in sorted(ahsp_dir.glob("*.json")):
            raw = json.loads(f.read_text(encoding="utf-8"))
            bidang = raw.get("bidang", "")
            source = raw.get("source", "")
            for it in raw.get("items", []):
                item = AHSPItem(**{**it, "bidang": bidang, "source": source})
                store.ahsp[item.code] = item

    harga_dir = base / "harga-satuan"
    if harga_dir.exists():
        for f in sorted(harga_dir.glob("*.json")):
            raw = json.loads(f.read_text(encoding="utf-8"))
            resources = raw.get("resources")
            if not isinstance(resources, list):
                continue
            code = raw.get("region_code") or f.stem
            effective_date = raw.get("effective_date", "2026-06-28")
            store.region_names[code] = raw.get("region", code)
            
            book: Dict[str, ResourcePrice] = {}
            for r in resources:
                rp = ResourcePrice(**r)
                book[rp.code] = rp
                
            pb_version = PriceBookVersion(
                effective_date=effective_date,
                source_file=f.name,
                resources=book
            )
            
            if code not in store.regions:
                store.regions[code] = []
            store.regions[code].append(pb_version)

    return store
