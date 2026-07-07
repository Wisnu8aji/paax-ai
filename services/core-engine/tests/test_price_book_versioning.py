import pytest
import json
from pathlib import Path
from app.rab.loader import load_data, DataStore
from app.rab.models import PriceBookVersion, ResourcePrice


def test_price_book_versioning(tmp_path: Path):
    harga_dir = tmp_path / "harga-satuan"
    harga_dir.mkdir(parents=True)
    
    # Versi 1
    v1 = {
        "region_code": "semarang",
        "effective_date": "2026-01-01",
        "resources": [
            {"code": "P-01", "name": "Semen", "category": "bahan", "unit": "kg", "price": 1000.0}
        ]
    }
    (harga_dir / "semarang_v1.json").write_text(json.dumps(v1))
    
    # Versi 2
    v2 = {
        "region_code": "semarang",
        "effective_date": "2026-06-28",
        "resources": [
            {"code": "P-01", "name": "Semen", "category": "bahan", "unit": "kg", "price": 1200.0}
        ]
    }
    (harga_dir / "semarang_v2.json").write_text(json.dumps(v2))
    
    store = load_data(tmp_path)
    assert len(store.regions["semarang"]) == 2
    
    # Tanpa as_of_date -> versi terbaru
    book_newest = store.price_book("semarang")
    assert book_newest["P-01"].price == 1200.0
    
    # as_of_date di antara versi 1 dan 2 -> versi 1
    book_old = store.price_book("semarang", as_of_date="2026-03-01")
    assert book_old["P-01"].price == 1000.0
    
    # as_of_date pass exact version 1
    book_old2 = store.price_book("semarang", as_of_date="2026-01-01")
    assert book_old2["P-01"].price == 1000.0
    
    # as_of_date sebelum versi tertua -> KeyError
    with pytest.raises(KeyError, match="Tidak ada versi buku harga yang berlaku pada atau sebelum"):
        store.price_book("semarang", as_of_date="2025-12-31")
