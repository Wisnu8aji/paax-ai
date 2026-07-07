import pytest
import math
from hypothesis import given, settings, strategies as st
from app.perception.vector.grid_geometry import _build_family, _Bubble
from app.perception.models import Run

def _make_bubble(x: float, label: str) -> _Bubble:
    return _Bubble(run_ids=[f"b_{label}"], label=label, cx=x, cy=100.0, diameter=10.0)

def _make_run(x: float, nilai: float, id_suffix: str) -> Run:
    return Run(
        run_id=f"r_{id_suffix}",
        text=str(nilai),
        bbox=(x-10, 50, x+10, 70),  # cy = 60, varies in x so primary is x, secondary is y
        font_name="Arial",
        font_size=10.0,
        font_flags=0,
        color=0,
        spans=[],
        rotasi=0
    )

@given(
    st.floats(min_value=0.0, max_value=1000.0), # start_x
    st.floats(min_value=1000.0, max_value=12000.0), # spacing
    st.integers(min_value=2, max_value=10) # N
)
@settings(max_examples=100)
def test_property_collinear_spans(start_x, spacing, N):
    """(a) grid yang direkonstruksi dari N titik kolinear dengan spasi seragam 
    menghasilkan bentang yang jumlahnya = jarak titik-pertama-ke-terakhir"""
    bubbles = []
    runs = []
    
    for i in range(N):
        x = start_x + i * spacing
        label = chr(65 + i)
        bubbles.append(_make_bubble(x, label))
        if i < N - 1:
            mid_x = start_x + i * spacing + spacing / 2
            runs.append(_make_run(mid_x, spacing, str(i)))
            
    axes, spans, total, offsets, consumed, axis_points = _build_family(
        cluster=bubbles, varies_in_x=True, runs=runs, used_ids=set()
    )
    
    assert len(spans) == N - 1
    total_span = sum(s.nilai for s in spans)
    expected_dist = spacing * (N - 1)
    assert abs(total_span - expected_dist) < 1e-4

@given(
    st.floats(min_value=0.0, max_value=1000.0), 
    st.floats(min_value=1000.0, max_value=12000.0), 
    st.integers(min_value=2, max_value=10),
    st.randoms()
)
@settings(max_examples=100)
def test_property_shuffle_invariance(start_x, spacing, N, rnd):
    """(b) titik yang di-shuffle urutannya menghasilkan grid yang SAMA (urutan input tidak memengaruhi hasil)"""
    bubbles = []
    runs = []
    for i in range(N):
        x = start_x + i * spacing
        label = chr(65 + i)
        bubbles.append(_make_bubble(x, label))
        if i < N - 1:
            mid_x = start_x + i * spacing + spacing / 2
            runs.append(_make_run(mid_x, spacing, str(i)))
            
    # original
    ax1, sp1, t1, off1, c1, ap1 = _build_family(list(bubbles), True, list(runs), set())
    
    # shuffled
    shuffled_bubbles = list(bubbles)
    rnd.shuffle(shuffled_bubbles)
    
    ax2, sp2, t2, off2, c2, ap2 = _build_family(shuffled_bubbles, True, list(runs), set())
    
    assert [a.model_dump() for a in ax1] == [a.model_dump() for a in ax2]
    assert [s.model_dump() for s in sp1] == [s.model_dump() for s in sp2]

@given(
    st.floats(min_value=0.0, max_value=1000.0), 
    st.floats(min_value=1000.0, max_value=12000.0),
    st.floats(min_value=0.01, max_value=2.0) # under align tol
)
@settings(max_examples=100)
def test_property_duplicate_points_no_negative_span(start_x, spacing, dup_offset):
    """(c) titik duplikat/sangat berdekatan (di bawah threshold toleransi)
    tidak menghasilkan bentang nol/negatif."""
    from app.perception.vector.grid_geometry import _ALIGN_TOL
    bubbles = [
        _make_bubble(start_x, "A"),
        _make_bubble(start_x + dup_offset, "A'"), # berdekatan
        _make_bubble(start_x + spacing, "B")
    ]
    runs = [
        _make_run(start_x + spacing / 2, spacing, "0")
    ]
    
    axes, spans, total, offsets, consumed, axis_points = _build_family(
        cluster=bubbles, varies_in_x=True, runs=runs, used_ids=set()
    )
    
    # Check no negative or zero spans
    for s in spans:
        assert s.nilai > 0.0
