from __future__ import annotations

import json

from app.perception.ocr.nvidia_vision_extractor import (
    NvidiaVisionClient,
    extract_spans_via_nvidia,
    parse_nemotron_ocr_v2_payload,
    parse_nemotron_parse_payload,
)


def test_parse_nemotron_parse_payload_reads_markdown_bbox_tool_call():
    payload = {
        "choices": [
            {
                "message": {
                    "tool_calls": [
                        {
                            "function": {
                                "name": "markdown_bbox",
                                "arguments": json.dumps(
                                    [[
                                        {
                                            "bbox": {
                                                "xmin": 0.10,
                                                "ymin": 0.20,
                                                "xmax": 0.30,
                                                "ymax": 0.25,
                                            },
                                            "text": "DENAH KOLOM K1",
                                            "type": "Text",
                                        }
                                    ]]
                                ),
                            }
                        }
                    ]
                }
            }
        ]
    }

    spans = parse_nemotron_parse_payload(payload, page=0, width=1000, height=2000)

    assert len(spans) == 1
    assert spans[0].text == "DENAH KOLOM K1"
    assert spans[0].bbox == (100.0, 400.0, 300.0, 500.0)
    assert spans[0].method == "ocr"
    assert spans[0].confidence == 0.72


def test_parse_nemotron_ocr_v2_payload_reads_detections():
    payload = {
        "data": [
            {
                "text_detections": [
                    {
                        "text_prediction": {"text": "K1 300x400", "confidence": 0.81},
                        "bounding_box": {
                            "points": [
                                {"x": 0.05, "y": 0.10},
                                {"x": 0.25, "y": 0.10},
                                {"x": 0.25, "y": 0.14},
                                {"x": 0.05, "y": 0.14},
                            ]
                        },
                    }
                ]
            }
        ]
    }

    spans = parse_nemotron_ocr_v2_payload(payload, page=2, width=2000, height=1000)

    assert [span.text for span in spans] == ["K1", "300x400"]
    assert spans[0].bbox == (100.0, 100.0, 300.0, 140.0)
    assert spans[1].bbox == (300.0, 100.0, 500.0, 140.0)
    assert spans[0].confidence == 0.81
    assert spans[0].span_id == "p2-nvidia-ocr-0000"


def test_parse_nemotron_parse_payload_splits_multiline_blocks_and_code_dimensions():
    payload = {
        "choices": [
            {
                "message": {
                    "tool_calls": [
                        {
                            "function": {
                                "arguments": json.dumps(
                                    [[{
                                        "bbox": {"xmin": 0.10, "ymin": 0.10, "xmax": 0.90, "ymax": 0.50},
                                        "text": "A\nB\nK1 300x400\nK2 400x400",
                                    }]]
                                )
                            }
                        }
                    ]
                }
            }
        ]
    }

    spans = parse_nemotron_parse_payload(payload, page=1, width=1000, height=1000)

    assert [span.text for span in spans] == ["A", "B", "K1", "300x400", "K2", "400x400"]
    assert spans[2].bbox[1] < spans[4].bbox[1]


def test_extract_spans_via_nvidia_returns_unavailable_without_key(monkeypatch):
    monkeypatch.delenv("NVIDIA_API_KEY", raising=False)
    monkeypatch.delenv("NVIDIA_DRAWING_FAST_API_KEY", raising=False)
    monkeypatch.delenv("NVIDIA_DRAWING_PARSE_API_KEY", raising=False)
    monkeypatch.delenv("NVIDIA_DRAWING_OCR_API_KEY", raising=False)

    result = extract_spans_via_nvidia("missing.png", page=0)

    assert result.available is False
    assert result.spans == []
    assert "nvidia_api_key" in result.message.lower()


def test_nvidia_vision_client_uses_model_specific_keys(monkeypatch):
    monkeypatch.setenv("NVIDIA_API_KEY", "nvapi-general")
    monkeypatch.setenv("NVIDIA_DRAWING_FAST_API_KEY", "nvapi-fast")
    monkeypatch.setenv("NVIDIA_DRAWING_PARSE_API_KEY", "nvapi-parse")
    monkeypatch.setenv("NVIDIA_DRAWING_OCR_API_KEY", "nvapi-ocr")

    client = NvidiaVisionClient.from_env()

    assert client is not None
    assert client.api_key == "nvapi-general"
    assert client.fast_api_key == "nvapi-fast"
    assert client.parse_api_key == "nvapi-parse"
    assert client.ocr_api_key == "nvapi-ocr"


def test_extract_spans_via_nvidia_prefers_parse_then_ocr(monkeypatch, tmp_path):
    image_path = tmp_path / "page.png"
    image_path.write_bytes(
        b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
        b"\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc```\x00\x00"
        b"\x00\x04\x00\x01\xf6\x178U\x00\x00\x00\x00IEND\xaeB`\x82"
    )
    monkeypatch.setenv("NVIDIA_API_KEY", "nvapi-test")

    class FakeClient(NvidiaVisionClient):
        def infer_parse(self, image_path: str):
            return {
                "choices": [
                    {
                        "message": {
                            "tool_calls": [
                                {
                                    "function": {
                                        "arguments": json.dumps(
                                            [[{"bbox": {"xmin": 0, "ymin": 0, "xmax": 1, "ymax": 1}, "text": "K1"}]]
                                        )
                                    }
                                }
                            ]
                        }
                    }
                ]
            }

        def infer_ocr(self, image_path: str):
            raise AssertionError("OCR should not run when parse already produced spans")

    result = extract_spans_via_nvidia(str(image_path), page=0, client=FakeClient(api_key="nvapi-test"))

    assert result.available is True
    assert result.spans[0].text == "K1"
    assert "nemotron-parse" in result.message
