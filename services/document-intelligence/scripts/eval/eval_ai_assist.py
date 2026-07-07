"""
PAAX Document Intelligence - Evaluasi AI-assist prompt/model
Jalankan manual:
$env:GEMINI_API_KEY="..."
python scripts/eval/eval_ai_assist.py
"""
import json
import os
import sys
import asyncio
from pathlib import Path

_THIS_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(_THIS_DIR.parents[1]))

from app.perception.ai_assist.client import GeminiAiAssistClient
from app.perception.ai_assist.zone_assist import suggest_zone
from app.perception.ai_assist.dimension_assist import suggest_footplat_dimensions
from app.perception.ai_assist.mep_assist import suggest_mep_points
from app.perception.ai_assist.arsitektur_area_assist import suggest_arsitektur_area

FIXTURE_DIR = _THIS_DIR.parents[1] / "tests" / "fixtures" / "perception" / "eval"

async def run_eval_zone(client):
    cases = json.loads((FIXTURE_DIR / "eval_cases_zone.json").read_text())
    passed = 0
    print("=== ZONE ===")
    for case in cases:
        print(f"Input: {case['input']}")
        result = await asyncio.to_thread(suggest_zone, case['input'], page_index=1, has_grid=True, has_elements=True, ai_client=client)
        actual = result.zone if result else None
        if actual == case['expected']:
            passed += 1
            print(f"  [PASS] Expected: {case['expected']}")
        else:
            print(f"  [FAIL] Expected: {case['expected']}, Got: {actual}")
    print(f"Zone accuracy: {passed}/{len(cases)}\n")
    return passed, len(cases)

async def run_eval_dimension(client):
    cases = json.loads((FIXTURE_DIR / "eval_cases_dimension.json").read_text())
    passed = 0
    print("=== DIMENSION ===")
    for case in cases:
        print(f"Input: {case['input']}")
        result = await asyncio.to_thread(suggest_footplat_dimensions, [case['input']], ai_client=client)
        
        ok = True
        if not result:
            print(f"  [FAIL] Returned None")
            continue
            
        for k, v in case['expected'].items():
            actual = getattr(result, k)
            if actual != v:
                print(f"  [FAIL] Field {k} expected {v}, got {actual}")
                ok = False
        if ok:
            passed += 1
            print(f"  [PASS] Matched {case['expected']}")
    print(f"Dimension accuracy: {passed}/{len(cases)}\n")
    return passed, len(cases)

async def run_eval_mep(client):
    cases = json.loads((FIXTURE_DIR / "eval_cases_mep.json").read_text())
    passed = 0
    print("=== MEP ===")
    for case in cases:
        print(f"Input: {case['input']}")
        result = await asyncio.to_thread(suggest_mep_points, [case['input']], ai_client=client)
        
        if not result or not result.items:
            print(f"  [FAIL] No items returned")
            continue
            
        actual_first = result.items[0]
        exp_first = case['expected'][0]
        if actual_first.jumlah == exp_first['jumlah']:
            passed += 1
            print(f"  [PASS] Expected count: {exp_first['jumlah']}")
        else:
            print(f"  [FAIL] Expected count: {exp_first['jumlah']}, got {actual_first.jumlah}")
    print(f"MEP accuracy: {passed}/{len(cases)}\n")
    return passed, len(cases)

async def run_eval_arsitektur(client):
    cases = json.loads((FIXTURE_DIR / "eval_cases_arsitektur.json").read_text())
    passed = 0
    print("=== ARSITEKTUR ===")
    for case in cases:
        print(f"Input: {case['input']}")
        result = await asyncio.to_thread(suggest_arsitektur_area, [case['input']], kategori=case['kategori'], ai_client=client)
        
        if not result:
            print(f"  [FAIL] Returned None")
            continue
            
        ok = True
        for k, v in case['expected'].items():
            actual = getattr(result, k, None)
            if actual != v:
                print(f"  [FAIL] Field {k} expected {v}, got {actual}")
                ok = False
        if ok:
            passed += 1
            print(f"  [PASS] Matched {case['expected']}")
    print(f"Arsitektur accuracy: {passed}/{len(cases)}\n")
    return passed, len(cases)

async def main():
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        print("Missing GEMINI_API_KEY. Set it first.")
        # Kita set stub client agar script bisa jalan (walaupun gagal tanpa LLM nyata)
        client = GeminiAiAssistClient(api_key="dummy")
    else:
        client = GeminiAiAssistClient(api_key=api_key)
    
    total_passed = 0
    total_cases = 0
    
    for eval_fn in [run_eval_zone, run_eval_dimension, run_eval_mep, run_eval_arsitektur]:
        try:
            p, t = await eval_fn(client)
            total_passed += p
            total_cases += t
        except Exception as e:
            print(f"Error running eval: {e}")
            
    print(f"Total Accuracy: {total_passed}/{total_cases} ({(total_passed/total_cases*100) if total_cases else 0:.1f}%)")

if __name__ == "__main__":
    asyncio.run(main())
