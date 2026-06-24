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

from .models import AHSPItem, ResourcePrice


def data_dir() -> Path:
    env = os.environ.get("PAAX_DATA_DIR")
    if env:
        return Path(env)
    # loader.py -> rab -> app -> core-engine -> services -> <repo-root>
    return Path(__file__).resolve().parents[4] / "data"


class DataStore:
    def __init__(self) -> None:
        self.ahsp: Dict[str, AHSPItem] = {}
        self.regions: Dict[str, Dict[str, ResourcePrice]] = {}
        self.region_names: Dict[str, str] = {}

    def price_book(self, region_code: str) -> Dict[str, ResourcePrice]:
        book = self.regions.get(region_code)
        if book is None:
            raise KeyError(
                f"Wilayah '{region_code}' tidak ditemukan. "
                f"Tersedia: {', '.join(self.regions) or '(kosong)'}"
            )
        return book


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
            code = raw.get("region_code") or f.stem
            store.region_names[code] = raw.get("region", code)
            book: Dict[str, ResourcePrice] = {}
            for r in raw.get("resources", []):
                rp = ResourcePrice(**r)
                book[rp.code] = rp
            store.regions[code] = book

    return store
