"""
Command Room + Drawing Intelligence Live Test
Lucent (DeepSeek) + Arete (Qwen) only. Max 10 calls. NO Noir.
"""
from __future__ import annotations
import json, os, sys, time, urllib.request, urllib.error, pathlib
from datetime import datetime

# Set encoding for Windows console
sys.stdout.reconfigure(encoding='utf-8') if hasattr(sys.stdout, 'reconfigure') else None

REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]

# Load from env or .env.local in main repo
def _load_key(name: str) -> str:
    val = os.environ.get(name, "").strip()
    if val:
        return val
    # Try reading from D:\paax-ai-main\.env.local
    env_local = pathlib.Path("D:/paax-ai-main/.env.local")
    if env_local.exists():
        for line in env_local.read_text(encoding='utf-8').splitlines():
            line = line.strip()
            if line.startswith(f"{name}="):
                return line.split("=", 1)[1].strip()
    return ""

DEEPSEEK_KEY = _load_key("DEEPSEEK_API_KEY")
DRAWING_KEY = _load_key("DRAWING_INTELLIGENCE_API_KEY")
OR_URL = "https://openrouter.ai/api/v1/chat/completions"

SYSTEM_PROMPT = "Anda adalah PAAX, asisten AI untuk insinyur sipil Indonesia. Jawab selalu dalam Bahasa Indonesia yang profesional dan terstruktur."

# 10 test cases: 5 Lucent + 5 Arete, no Noir
CR_TESTS = [
    ("lucent", "deepseek/deepseek-v4-pro", "Halo, apa saja jenis gambar kerja yang biasa ada dalam proyek konstruksi gedung bertingkat?"),
    ("arete",  "qwen/qwen3.7-plus",        "Halo, bisa jelaskan perbedaan denah lantai 1 dan denah struktur lantai 1?"),
    ("lucent", "deepseek/deepseek-v4-pro", "Apa perbedaan antara kolom K1 dan K2 pada dokumen gambar kerja arsitektur?"),
    ("arete",  "qwen/qwen3.7-plus",        "Apa yang dimaksud dengan klasifikasi sheet: cover, drawing list, dan technical note?"),
    ("lucent", "deepseek/deepseek-v4-pro", "Bagaimana cara membaca tabel kolom pada gambar kerja untuk menentukan dimensi beton?"),
    ("arete",  "qwen/qwen3.7-plus",        "Jelaskan perbedaan antara tampak depan, tampak samping, dan potongan pada gambar arsitektur."),
    ("lucent", "deepseek/deepseek-v4-pro", "Bagaimana sistem klasifikasi sheet gambar kerja bangunan bertingkat berdasarkan level lantai?"),
    ("arete",  "qwen/qwen3.7-plus",        "Apa yang dimaksud MEP dalam gambar kerja dan sheet apa saja yang termasuk kategori MEP?"),
    ("lucent", "deepseek/deepseek-v4-pro", "Apa itu quantity takeoff dan mengapa penting dalam proyek konstruksi?"),
    ("arete",  "qwen/qwen3.7-plus",        "Dalam drawing intelligence, apa perbedaan antara DEM extraction dan PCKM synthesis?"),
]

# 5 Drawing Intelligence tests (using drawing key, classification proposals only, NO re-transcription)
DI_TESTS = [
    {
        "model": "qwen/qwen3.7-plus",
        "case_id": "sheet-cover",
        "extracted_text": ["GAMBAR KERJA", "DAFTAR ISI GAMBAR"],
        "bbox_evidence": [{"evidence_ref": "EV-COVER-1", "bbox": [40, 40, 520, 160]}],
        "allowed_categories": ["cover", "drawing_list", "technical_note"],
    },
    {
        "model": "deepseek/deepseek-v4-pro",
        "case_id": "sheet-plan-l1",
        "extracted_text": ["DENAH LANTAI 1", "SKALA 1:100"],
        "bbox_evidence": [{"evidence_ref": "EV-PLAN-1", "bbox": [35, 20, 480, 90]}],
        "allowed_categories": ["plan", "site_plan", "detail"],
    },
    {
        "model": "qwen/qwen3.7-plus",
        "case_id": "sheet-section",
        "extracted_text": ["POTONGAN A-A", "ELEVASI +4.000"],
        "bbox_evidence": [{"evidence_ref": "EV-SECTION-1", "bbox": [60, 30, 500, 120]}],
        "allowed_categories": ["section", "elevation", "detail"],
    },
    {
        "model": "deepseek/deepseek-v4-pro",
        "case_id": "sheet-schedule",
        "extracted_text": ["TABEL KOLOM", "K1 400 x 400"],
        "bbox_evidence": [{"evidence_ref": "EV-SCHEDULE-1", "bbox": [80, 80, 900, 620]}],
        "allowed_categories": ["schedule", "detail", "technical_note"],
    },
    {
        "model": "qwen/qwen3.7-plus",
        "case_id": "sheet-mep-diagram",
        "extracted_text": ["SINGLE LINE DIAGRAM", "PANEL DISTRIBUSI"],
        "bbox_evidence": [{"evidence_ref": "EV-DIAGRAM-1", "bbox": [50, 45, 740, 520]}],
        "allowed_categories": ["diagram", "plan", "technical_note"],
    },
]


def call_api(api_key: str, model_slug: str, messages: list, max_tokens: int = 512, retries: int = 2) -> dict:
    payload = {
        "model": model_slug,
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": 0,
        "stream": False,
    }
    body = json.dumps(payload).encode("utf-8")
    last_err: Exception | None = None
    for attempt in range(retries + 1):
        if attempt > 0:
            print(f"    [retry {attempt}] waiting 3s...")
            time.sleep(3)
        req = urllib.request.Request(OR_URL, data=body, method="POST", headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://paax.ai",
            "X-Title": "PAAX Live Test",
        })
        t0 = time.perf_counter()
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                raw = json.loads(resp.read())
        except urllib.error.HTTPError as exc:
            raw_body = exc.read().decode("utf-8", errors="replace")
            last_err = RuntimeError(f"HTTP {exc.code}: {raw_body[:200]}")
            continue
        latency_ms = int((time.perf_counter() - t0) * 1000)
        choices = raw.get("choices")
        if not choices:
            err_info = raw.get("error", {}) if isinstance(raw, dict) else {}
            last_err = RuntimeError(f"Empty choices from provider. error={err_info}")
            continue
        content = choices[0]["message"]["content"]
        usage = raw.get("usage", {})
        return {
            "content": content,
            "latency_ms": latency_ms,
            "input_tokens": usage.get("prompt_tokens", 0),
            "output_tokens": usage.get("completion_tokens", 0),
        }
    raise last_err or RuntimeError("call_api failed after retries")


def run_command_room_tests() -> list:
    print("\n=== COMMAND ROOM LIVE TEST (Lucent + Arete, max 10x, NO Noir) ===\n")
    if not DEEPSEEK_KEY:
        print("  SKIP: DEEPSEEK_API_KEY not available")
        return []

    results = []
    for i, (model_name, model_slug, question) in enumerate(CR_TESTS):
        print(f"  [{i+1}/10] {model_name.upper()} | {question[:60]}...")
        try:
            resp = call_api(DEEPSEEK_KEY, model_slug, [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": question},
            ])
            preview = resp["content"][:150].replace("\n", " ")
            print(f"    OK {resp['latency_ms']}ms | {resp['output_tokens']} tokens")
            print(f"    >> {preview}...")
            results.append({"model": model_name, "slug": model_slug, "question": question, "status": "ok",
                            "latency_ms": resp["latency_ms"], "output_tokens": resp["output_tokens"],
                            "answer_preview": resp["content"][:300]})
        except Exception as e:
            print(f"    ERROR: {e}")
            results.append({"model": model_name, "slug": model_slug, "question": question, "status": "error", "error": str(e)})
        time.sleep(0.5)
    return results


def run_drawing_intelligence_tests() -> list:
    print("\n=== DRAWING INTELLIGENCE AI TEST (5 sheet classification, NO 88-page re-analysis) ===\n")
    if not DRAWING_KEY:
        print("  SKIP: DRAWING_INTELLIGENCE_API_KEY not available")
        return []

    results = []
    for i, tc in enumerate(DI_TESTS):
        print(f"  [{i+1}/5] {tc['model'].split('/')[-1].upper()} | case={tc['case_id']}")
        evidence = {str(item["evidence_ref"]) for item in tc["bbox_evidence"]}
        prompt = {
            "task": "Propose one sheet classification for human review. Never calculate quantities.",
            "allowed_categories": sorted(tc["allowed_categories"]),
            "extracted_text": tc["extracted_text"],
            "bbox_evidence": tc["bbox_evidence"],
            "required_json": {"classification_key": "string", "evidence_refs": ["string"], "reason": "string"},
        }
        try:
            resp = call_api(DRAWING_KEY, tc["model"], [
                {"role": "system", "content": "Return JSON only. Cite only supplied evidence refs."},
                {"role": "user", "content": json.dumps(prompt, ensure_ascii=False)},
            ], max_tokens=256)
            content = resp["content"]
            # Parse and validate
            try:
                proposal = json.loads(content)
            except Exception:
                proposal = {}
            category = str(proposal.get("classification_key", ""))
            cited = set(str(v) for v in proposal.get("evidence_refs", []))
            valid = category in tc["allowed_categories"] and bool(cited) and cited <= evidence
            print(f"    OK {resp['latency_ms']}ms | category={category} | valid={valid}")
            results.append({"case_id": tc["case_id"], "model": tc["model"], "status": "ok",
                            "latency_ms": resp["latency_ms"], "category": category, "valid": valid,
                            "proposal": proposal})
        except Exception as e:
            print(f"    ERROR: {e}")
            results.append({"case_id": tc["case_id"], "model": tc["model"], "status": "error", "error": str(e)})
        time.sleep(0.5)
    return results


def main():
    print("=== PAAX Live AI Test Suite ===")
    print(f"Time: {datetime.now().isoformat()}")
    print(f"DEEPSEEK_KEY available: {bool(DEEPSEEK_KEY)}")
    print(f"DRAWING_KEY available: {bool(DRAWING_KEY)}")

    cr_results = run_command_room_tests()
    di_results = run_drawing_intelligence_tests()

    cr_ok = sum(1 for r in cr_results if r.get("status") == "ok")
    di_ok = sum(1 for r in di_results if r.get("status") == "ok")
    di_valid = sum(1 for r in di_results if r.get("valid"))

    print(f"\n=== FINAL SUMMARY ===")
    print(f"Command Room: {cr_ok}/{len(cr_results)} OK (Lucent+Arete, NO Noir)")
    print(f"Drawing Intelligence: {di_ok}/{len(di_results)} OK | {di_valid}/{len(di_results)} valid proposals")

    report = {
        "timestamp": datetime.now().isoformat(),
        "command_room": {
            "total": len(cr_results), "ok": cr_ok,
            "models_used": ["lucent", "arete"], "noir_excluded": True,
            "results": cr_results,
        },
        "drawing_intelligence": {
            "total": len(di_results), "ok": di_ok, "valid_proposals": di_valid,
            "note": "NO 88-page re-transcription. Used pre-extracted fixture evidence only.",
            "results": di_results,
        },
    }
    out = REPO_ROOT / "report" / "report_drawing_intelligence" / "LIVE_AI_TEST_2026-07-27.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Report saved: {out}")
    sys.exit(0 if (cr_ok == len(cr_results) and di_ok == len(di_results)) else 1)


if __name__ == "__main__":
    main()
