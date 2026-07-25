from __future__ import annotations

import json

from app.perception.ai_report import (
    DeepSeekAiReportClient,
    _ai_prompt,
    build_ai_report,
    parse_deepseek_json_text,
)
from app.perception.consolidated_models import (
    Assumption,
    ConsolidatedExtraction,
    ElementDefinisi,
    ElementInstanceRef,
    ElementRegistryEntry,
    SheetSummary,
)
from app.perception.work_items import DrawingWorkItem, DrawingWorkItemsResult
from app.perception.ai_assist.client import NvidiaAiAssistClient


def test_ai_report_turns_raw_extraction_into_user_ready_summary_without_noise():
    consolidated = ConsolidatedExtraction(
        sheets=[
            SheetSummary(page=1, sheet_id="S01", zone=None, judul="GAMBAR KERJA", skala=None),
            SheetSummary(page=2, sheet_id="S02", zone="struktur_lantai_1", judul="DENAH KOLOM LT.1", skala="1:100"),
        ],
        element_registry=[
            ElementRegistryEntry(
                kode="K1",
                kategori="kolom",
                instances=[ElementInstanceRef(sheet_page=2, alamat="A1", kode_raw="K1")],
                definisi=ElementDefinisi(
                    dimensi={"b": 300, "h": 400},
                    satuan_dimensi="mm",
                    mutu_beton="K-250",
                    sumber_halaman=2,
                ),
            ),
        ],
        assumptions=[
            Assumption(
                pernyataan="Teks 'KEMENTERIAN AGAMA RI' tidak dikenali di sheet 1",
                alasan="kop administrasi",
                sheet_page=1,
                dampak="rendah",
            ),
            Assumption(
                pernyataan="Dimensi tinggi kolom belum terbaca dari gambar",
                alasan="dibutuhkan untuk volume beton",
                sheet_page=2,
                dampak="tinggi",
            ),
        ],
    )
    work_items = DrawingWorkItemsResult(
        work_items=[
            DrawingWorkItem(
                work_id="K1:beton:1",
                kode="K1",
                kode_asli=["K1"],
                kategori="kolom",
                work_type="beton",
                uraian="Beton kolom K1",
                wbs_section="III",
                wbs_title="Pekerjaan Struktur",
                formula_status="dihitung",
                unit="m3",
                volume=1.25,
                formula="0.3 * 0.4 * tinggi * n",
                rule_id="F-KOLOM-BETON",
                source_pages=[2],
                element_refs=["A1"],
                needs_review=False,
            )
        ]
    )

    report = build_ai_report(
        project_id="prj-test",
        file_name="gambar.pdf",
        classification="STRUCTURAL_DRAWING",
        classification_confidence=0.84,
        consolidated=consolidated,
        work_items=work_items,
        ai_client=None,
    )

    assert report.project_summary.total_pages == 2
    assert report.project_summary.project_kind == "Gambar kerja struktur"
    assert "2 halaman" in report.technical_summary
    assert report.sheets[0].interpreted_title == "Cover / informasi umum gambar kerja"
    assert report.sheets[1].interpreted_title == "DENAH KOLOM LT.1"
    assert report.detected_work_items[0].item_pekerjaan == "Beton kolom K1"
    assert report.detected_work_items[0].status == "Siap diproses"
    assert report.detected_work_items[0].source_pages == [2]
    assert len(report.verification_notes) == 1
    assert "KEMENTERIAN" not in report.model_dump_json()
    assert report.next_action_label == "Proses RAB"
    assert [stage.stage for stage in report.model_stack] == [
        "fast_visual",
        "ocr_layout",
        "ocr_backup",
        "deep_review",
        "civil_reasoning",
    ]
    assert report.model_stack[0].model == "nvidia/nemotron-nano-12b-v2-vl"
    assert report.model_stack[1].model == "nvidia/nemotron-parse"
    assert report.model_stack[2].model == "nvidia/nemotron-ocr-v2"
    assert report.model_stack[3].model == "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning"
    assert report.model_stack[4].model == "deepseek-ai/deepseek-v4-pro"


def test_parse_deepseek_json_text_accepts_plain_json_and_code_fences():
    assert parse_deepseek_json_text('{"technical_summary":"ok"}') == {"technical_summary": "ok"}
    assert parse_deepseek_json_text('```json\n{"technical_summary":"ok"}\n```') == {"technical_summary": "ok"}


def test_deepseek_client_uses_openai_compatible_chat_completions_shape():
    sent = {}

    def fake_urlopen(req, timeout):
        sent["url"] = req.full_url
        sent["headers"] = dict(req.header_items())
        sent["body"] = req.data.decode("utf-8")

        class FakeResponse:
            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

            def read(self):
                return (
                    b'{"choices":[{"message":{"content":"{\\"technical_summary\\":\\"hasil\\"}"}}],'
                    b'"usage":{"prompt_tokens":10,"completion_tokens":4}}'
                )

        return FakeResponse()

    client = DeepSeekAiReportClient(
        api_key="sk-test",
        model="deepseek-v4-flash",
        urlopen=fake_urlopen,
    )
    result = client.generate_json(
        system_prompt="system",
        user_prompt="user",
        operation_name="ai_report:test",
    )

    assert result == {"technical_summary": "hasil"}
    assert sent["url"] == "https://api.deepseek.com/chat/completions"
    assert "Bearer sk-test" in sent["headers"]["Authorization"]
    assert '"model": "deepseek-v4-flash"' in sent["body"]
    assert '"thinking": {"type": "disabled"}' in sent["body"]
    assert '"user_id": "paax-drawing-intelligence"' in sent["body"]


def test_drawing_ai_report_client_prefers_nvidia_deepseek_from_env(monkeypatch):
    monkeypatch.setenv("NVIDIA_API_KEY", "nvapi-test")
    monkeypatch.setenv("NVIDIA_BASE_URL", "https://integrate.api.nvidia.com/v1")
    monkeypatch.setenv("NVIDIA_DRAWING_REVIEW_MODEL", "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning")
    monkeypatch.setenv("DEEPSEEK_API_KEY", "")

    client = DeepSeekAiReportClient.from_env()

    assert client is not None
    assert client.provider == "nvidia"
    assert client.model == "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning"
    assert client.api_url == "https://integrate.api.nvidia.com/v1/chat/completions"
    assert client.timeout_seconds == 3600.0


def test_drawing_ai_report_client_uses_review_specific_nvidia_key(monkeypatch):
    monkeypatch.setenv("NVIDIA_API_KEY", "nvapi-general")
    monkeypatch.setenv("NVIDIA_DRAWING_REVIEW_API_KEY", "nvapi-review")
    monkeypatch.setenv("NVIDIA_BASE_URL", "https://integrate.api.nvidia.com/v1")
    monkeypatch.setenv("DEEPSEEK_API_KEY", "")

    client = DeepSeekAiReportClient.from_env()

    assert client is not None
    assert client.api_key == "nvapi-review"
    assert client.provider == "nvidia"


def test_nvidia_ai_assist_client_uses_review_specific_key(monkeypatch):
    monkeypatch.setenv("NVIDIA_API_KEY", "nvapi-general")
    monkeypatch.setenv("NVIDIA_DRAWING_REVIEW_API_KEY", "nvapi-review")
    monkeypatch.setenv("NVIDIA_BASE_URL", "https://integrate.api.nvidia.com/v1")

    client = NvidiaAiAssistClient.from_env()

    assert client is not None
    assert client.api_key == "nvapi-review"
    assert client.api_url == "https://integrate.api.nvidia.com/v1/chat/completions"


def test_ai_prompt_compacts_large_reports_before_nvidia_review():
    consolidated = ConsolidatedExtraction(
        sheets=[
            SheetSummary(page=page, sheet_id=f"S{page:03d}", zone="struktur_lantai_1", judul=f"DENAH STRUKTUR {page}", skala="1:100")
            for page in range(1, 89)
        ],
        element_registry=[],
        assumptions=[
            Assumption(
                pernyataan=f"Grid atau dimensi belum terbaca pada halaman {page}",
                alasan="butuh verifikasi sebelum dihitung",
                sheet_page=page,
                dampak="tinggi" if page % 7 == 0 else "rendah",
            )
            for page in range(1, 1008)
        ],
    )
    work_items = DrawingWorkItemsResult(
        work_items=[
            DrawingWorkItem(
                work_id=f"K{idx}:beton:1",
                kode=f"K{idx}",
                kode_asli=[f"K{idx}"],
                kategori="kolom",
                work_type="beton",
                uraian=f"Beton kolom K{idx}",
                wbs_section="III",
                wbs_title="Pekerjaan Struktur",
                formula_status="perlu_review",
                unit="m3",
                volume=None,
                formula=None,
                rule_id="F-KOLOM-BETON",
                source_pages=[idx],
                element_refs=[f"A{idx}"],
                needs_review=True,
                review_reason="dimensi tinggi belum lengkap",
            )
            for idx in range(1, 43)
        ]
    )
    report = build_ai_report(
        project_id="plhut",
        file_name="GAMBAR KERJA PLHUT SURAKARTA.pdf",
        classification="STRUCTURAL_DRAWING",
        classification_confidence=0.8,
        consolidated=consolidated,
        work_items=work_items,
        ai_client=None,
    )

    _system_prompt, user_prompt = _ai_prompt(report)
    payload = json.loads(user_prompt)

    assert len(user_prompt) < 35000
    assert payload["sheets_total"] == 88
    assert len(payload["sheets_sample"]) <= 30
    assert payload["detected_work_items_total"] == 42
    assert payload["verification_notes_total"] == 1007
    assert len(payload["verification_notes_sample"]) <= 24
    assert "model_stack" not in payload
