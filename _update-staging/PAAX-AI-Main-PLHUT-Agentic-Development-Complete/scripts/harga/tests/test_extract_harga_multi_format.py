import pytest
from pathlib import Path
from openpyxl import Workbook
from extract_harga import load_price_rows


def create_mock_xlsx(tmp_path: Path, rows: list, filename: str) -> Path:
    wb = Workbook()
    ws = wb.active
    ws.title = "Lembar1"
    for r_idx, row in enumerate(rows, start=1):
        for c_idx, val in enumerate(row, start=1):
            ws.cell(row=r_idx, column=c_idx, value=val)
    path = tmp_path / filename
    wb.save(path)
    return path


def test_format_semarang(tmp_path: Path):
    # Kolom: No | Uraian | Satuan (ke 5) | Harga (ke 6) ... wait, semarang format col name = 2, unit = 5, price = 6
    rows = [
        ["No", "Uraian", "A", "B", "Satuan", "Harga"],
        ["", "Bahan", "", "", "", ""],
        [1, "Semen Portland", "", "", "kg", 1500.0]
    ]
    p = create_mock_xlsx(tmp_path, rows, "semarang.xlsx")
    res = load_price_rows(p, fmt="auto")
    assert len(res) == 1
    assert res[0].source_name == "Semen Portland"
    assert res[0].unit == "kg"
    assert res[0].price == 1500.0
    assert res[0].category == "bahan"


def test_format_kedua_auto(tmp_path: Path):
    # Format baru: No | Nama Material | Harga Satuan | Keterangan | Satuan
    # col name = 2, col price = 3, col unit = 5
    rows = [
        ["No", "Nama Material", "Harga Satuan", "Ket", "Satuan"],
        ["", "Upah", "", "", ""],
        [1, "Tukang Kayu", 120000.0, "-", "OH"]
    ]
    p = create_mock_xlsx(tmp_path, rows, "baru.xlsx")
    res = load_price_rows(p, fmt="auto")
    assert len(res) == 1
    assert res[0].source_name == "Tukang Kayu"
    assert res[0].unit == "OH"
    assert res[0].price == 120000.0
    assert res[0].category == "upah"


def test_format_tidak_dikenal(tmp_path: Path):
    rows = [
        ["Acak1", "Acak2", "Acak3"],
        [1, "Data", 1000]
    ]
    p = create_mock_xlsx(tmp_path, rows, "acak.xlsx")
    with pytest.raises(ValueError, match="format tidak dikenali, kolom nama/satuan/harga tidak ditemukan"):
        load_price_rows(p, fmt="auto")
