import json
from pathlib import Path
from app.perception.models import TextSpan
from app.perception.assemble import merge_runs, _extract_elements
from app.perception.tkg.models import TkgSheet, TkgDocument, SheetMeta, Grid
from app.perception.consolidate import consolidate_document
from app.perception.work_items import build_work_items

def load_plhut_document() -> TkgDocument:
    data = json.loads(Path("tests/fixtures/perception/plhut_spans.json").read_text(encoding="utf-8"))
    
    spans_by_page: dict[int, list[TextSpan]] = {}
    for s_dict in data["spans"]:
        span = TextSpan(**s_dict)
        spans_by_page.setdefault(span.page, []).append(span)
        
    sheets = []
    for page_idx, spans in sorted(spans_by_page.items()):
        runs = merge_runs(spans)
        empty_grid = Grid(sumbu_x=[], sumbu_y=[], bentang_x=[], bentang_y=[], total_x=None, total_y=None, offset_tepi=[])
        elements, unclassified = _extract_elements(runs, set(), empty_grid, {})
        
        sheet = TkgSheet(
            sheet_id=f"S{page_idx+1:02d}",
            jenis="campuran",
            meta=SheetMeta(judul=f"Sheet {page_idx+1}", skala=None, zone="Belum Diklasifikasi"),
            grid=empty_grid,
            levels=[],
            tables=[],
            elements=elements,
            unclassified=unclassified,
        )
        sheets.append(sheet)
        
    return TkgDocument(prj_id="PLHUT-GOLDEN", rev_id="R0", generated_by="test", sheets=sheets)

def test_golden_snapshot_matches_current_pipeline():
    snapshot_path = Path("tests/fixtures/perception/plhut_golden_snapshot.json")
    expected = json.loads(snapshot_path.read_text(encoding="utf-8"))
    
    doc = load_plhut_document()
    consolidated = consolidate_document(doc, ai_client=None)
    work_items = build_work_items(consolidated, takeoff_items=[])
    
    cat_counts = {}
    status_counts = {"perlu_review": 0, "dihitung": 0, "belum_didukung": 0}
    total_assumptions = len(consolidated.assumptions)
    
    for item in work_items.work_items:
        cat_counts[item.kategori] = cat_counts.get(item.kategori, 0) + 1
        status_counts[item.formula_status] = status_counts.get(item.formula_status, 0) + 1
        
    current = {
        "kategori": cat_counts,
        "status": status_counts,
        "total_assumptions": total_assumptions
    }
    
    assert current == expected, (
        "Golden snapshot mismatch! Jika ini karena perubahan fitur/grammar baru, "
        "jalankan _regenerate_golden_snapshot.py untuk memperbarui snapshot."
    )
