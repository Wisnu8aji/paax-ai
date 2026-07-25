"""NVIDIA vision/OCR adapter for raster Drawing Intelligence pages.

This module keeps the PAAX rule pipeline in control: NVIDIA models only
produce OCR-like ``TextSpan`` values that flow back through merge-run/grammar.
"""
from __future__ import annotations

import base64
import json
import os
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable
from urllib import error, request

from app.perception.models import TextSpan
from app.perception.ocr.paddle_ocr_extractor import OcrExtractionResult


NVIDIA_CHAT_URL = "https://integrate.api.nvidia.com/v1/chat/completions"
NVIDIA_OCR_V2_URL = "https://ai.api.nvidia.com/v1/cv/nvidia/nemotron-ocr-v2"
NVIDIA_FAST_MODEL = "nvidia/nemotron-nano-12b-v2-vl"
NVIDIA_PARSE_MODEL = "nvidia/nemotron-parse"
NVIDIA_OCR_MODEL = "nvidia/nemotron-ocr-v2"
_DEFAULT_TIMEOUT_SECONDS = 120.0
_CODE_DIM_LINE = re.compile(r"^([A-Z]{1,4}\d+[A-Z]?)\s+(\d+(?:[.,]\d+)?\s*[xX]\s*\d+(?:[.,]\d+)?(?:\s*[xX]\s*\d+(?:[.,]\d+)?)?)$")


def _model_env(name: str, fallback: str) -> str:
    value = os.getenv(name, "").strip()
    if not value or value.startswith("nvapi-"):
        return fallback
    return value


def _nvidia_key_env(*names: str) -> str:
    for name in (*names, "NVIDIA_API_KEY"):
        value = os.getenv(name, "").strip()
        if value:
            return value
    return ""


def _image_size(path: str) -> tuple[int, int]:
    try:
        from PIL import Image

        with Image.open(path) as image:
            return int(image.width), int(image.height)
    except Exception:
        return 1000, 1000


def _image_data_url(path: str) -> str:
    suffix = Path(path).suffix.lower()
    mime = "image/jpeg" if suffix in {".jpg", ".jpeg"} else "image/png"
    encoded = base64.b64encode(Path(path).read_bytes()).decode("ascii")
    return f"data:{mime};base64,{encoded}"


def _bbox_from_relative(
    bbox: dict[str, Any],
    *,
    width: int,
    height: int,
) -> tuple[float, float, float, float] | None:
    try:
        return (
            float(bbox["xmin"]) * width,
            float(bbox["ymin"]) * height,
            float(bbox["xmax"]) * width,
            float(bbox["ymax"]) * height,
        )
    except (KeyError, TypeError, ValueError):
        return None


def _bbox_from_points(
    points: list[dict[str, Any]],
    *,
    width: int,
    height: int,
) -> tuple[float, float, float, float] | None:
    if not points:
        return None
    try:
        xs = [float(point["x"]) for point in points]
        ys = [float(point["y"]) for point in points]
    except (KeyError, TypeError, ValueError):
        return None
    return (min(xs) * width, min(ys) * height, max(xs) * width, max(ys) * height)


def _span(
    *,
    page: int,
    index: int,
    text: str,
    bbox: tuple[float, float, float, float],
    confidence: float,
    source: str,
) -> TextSpan:
    x0, y0, x1, y1 = bbox
    return TextSpan(
        span_id=f"p{page}-nvidia-{source}-{index:04d}",
        page=page,
        text=text.strip(),
        bbox=(float(x0), float(y0), float(x1), float(y1)),
        rotasi=0,
        font_size=max(1.0, float(y1) - float(y0)),
        origin=(float(x0), float(y1)),
        method="ocr",
        confidence=confidence,
        line_hint=index,
    )


def _split_ocr_items(text: str, bbox: tuple[float, float, float, float]) -> list[tuple[str, tuple[float, float, float, float]]]:
    lines = [line.strip() for line in text.replace("\r", "\n").split("\n") if line.strip()]
    if not lines:
        return []
    x0, y0, x1, y1 = bbox
    line_h = (y1 - y0) / max(len(lines), 1)
    items: list[tuple[str, tuple[float, float, float, float]]] = []
    for i, line in enumerate(lines):
        ly0 = y0 + (line_h * i)
        ly1 = y0 + (line_h * (i + 1))
        match = _CODE_DIM_LINE.match(line.upper().replace(" X ", "x"))
        if match:
            left_w = (x1 - x0) * 0.5
            items.append((match.group(1), (x0, ly0, x0 + left_w, ly1)))
            items.append((match.group(2).replace(" ", "").replace("X", "x"), (x0 + left_w, ly0, x1, ly1)))
        else:
            items.append((line, (x0, ly0, x1, ly1)))
    return items


def parse_nemotron_parse_payload(payload: dict[str, Any], *, page: int, width: int, height: int) -> list[TextSpan]:
    spans: list[TextSpan] = []
    choices = payload.get("choices") or []
    for choice in choices:
        message = (choice or {}).get("message") or {}
        tool_calls = message.get("tool_calls") or []
        for tool_call in tool_calls:
            function = (tool_call or {}).get("function") or {}
            arguments = function.get("arguments")
            if not isinstance(arguments, str):
                continue
            try:
                parsed = json.loads(arguments)
            except json.JSONDecodeError:
                continue
            rows = parsed if isinstance(parsed, list) else [parsed]
            for row in rows:
                items = row if isinstance(row, list) else [row]
                for item in items:
                    if not isinstance(item, dict):
                        continue
                    text = str(item.get("text") or "").strip()
                    bbox_raw = item.get("bbox")
                    if not text or not isinstance(bbox_raw, dict):
                        continue
                    bbox = _bbox_from_relative(bbox_raw, width=width, height=height)
                    if bbox is None:
                        continue
                    for split_text, split_bbox in _split_ocr_items(text, bbox):
                        spans.append(_span(
                            page=page,
                            index=len(spans),
                            text=split_text,
                            bbox=split_bbox,
                            confidence=0.72,
                            source="parse",
                        ))
    return spans


def parse_nemotron_ocr_v2_payload(payload: dict[str, Any], *, page: int, width: int, height: int) -> list[TextSpan]:
    spans: list[TextSpan] = []
    for page_data in payload.get("data") or []:
        for detection in (page_data or {}).get("text_detections") or []:
            prediction = detection.get("text_prediction") or {}
            text = str(prediction.get("text") or "").strip()
            if not text:
                continue
            bbox_raw = (detection.get("bounding_box") or {}).get("points") or []
            bbox = _bbox_from_points(bbox_raw, width=width, height=height)
            if bbox is None:
                continue
            confidence = float(prediction.get("confidence") or 0.6)
            for split_text, split_bbox in _split_ocr_items(text, bbox):
                spans.append(_span(
                    page=page,
                    index=len(spans),
                    text=split_text,
                    bbox=split_bbox,
                    confidence=confidence,
                    source="ocr",
                ))
    return spans


@dataclass
class NvidiaVisionClient:
    api_key: str
    chat_url: str = NVIDIA_CHAT_URL
    ocr_url: str = NVIDIA_OCR_V2_URL
    fast_api_key: str | None = None
    parse_api_key: str | None = None
    ocr_api_key: str | None = None
    timeout_seconds: float = _DEFAULT_TIMEOUT_SECONDS
    urlopen: Callable[..., Any] = request.urlopen

    @classmethod
    def from_env(cls) -> "NvidiaVisionClient | None":
        api_key = _nvidia_key_env()
        fast_api_key = _nvidia_key_env("NVIDIA_DRAWING_FAST_API_KEY", "NVIDIA_FAST_VISUAL_API_KEY")
        parse_api_key = _nvidia_key_env("NVIDIA_DRAWING_PARSE_API_KEY", "NVIDIA_OCR_LAYOUT_API_KEY")
        ocr_api_key = _nvidia_key_env("NVIDIA_DRAWING_OCR_API_KEY", "NVIDIA_OCR_API_KEY")
        if not any((api_key, fast_api_key, parse_api_key, ocr_api_key)):
            return None
        return cls(
            api_key=api_key or fast_api_key or parse_api_key or ocr_api_key,
            chat_url=os.getenv("NVIDIA_BASE_URL", "https://integrate.api.nvidia.com/v1").rstrip("/") + "/chat/completions",
            ocr_url=os.getenv("NVIDIA_OCR_V2_URL", NVIDIA_OCR_V2_URL).strip() or NVIDIA_OCR_V2_URL,
            fast_api_key=fast_api_key or None,
            parse_api_key=parse_api_key or None,
            ocr_api_key=ocr_api_key or None,
        )

    def _post_json(self, url: str, body: dict[str, Any], api_key: str | None = None) -> dict[str, Any]:
        key = (api_key or self.api_key).strip()
        req = request.Request(
            url,
            data=json.dumps(body).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {key}",
            },
            method="POST",
        )
        with self.urlopen(req, timeout=self.timeout_seconds) as response:
            payload = json.loads(response.read().decode("utf-8"))
        if not isinstance(payload, dict):
            raise ValueError("NVIDIA response is not a JSON object")
        return payload

    def infer_fast_visual(self, image_path: str) -> dict[str, Any]:
        data_url = _image_data_url(image_path)
        return self._post_json(self.chat_url, {
            "model": _model_env("NVIDIA_DRAWING_FAST_MODEL", NVIDIA_FAST_MODEL),
            "messages": [{
                "role": "user",
                "content": [
                    {"type": "text", "text": "Classify this engineering drawing page in one concise sentence."},
                    {"type": "image_url", "image_url": {"url": data_url}},
                ],
            }],
            "max_tokens": 96,
            "temperature": 0.2,
        }, api_key=self.fast_api_key)

    def infer_parse(self, image_path: str) -> dict[str, Any]:
        data_url = _image_data_url(image_path)
        return self._post_json(self.chat_url, {
            "model": _model_env("NVIDIA_DRAWING_PARSE_MODEL", NVIDIA_PARSE_MODEL),
            "messages": [{
                "role": "user",
                "content": [{"type": "image_url", "image_url": {"url": data_url}}],
            }],
            "max_tokens": 4096,
            "temperature": 0.0,
        }, api_key=self.parse_api_key)

    def infer_ocr(self, image_path: str) -> dict[str, Any]:
        return self._post_json(self.ocr_url, {
            "input": [{
                "type": "image_url",
                "url": _image_data_url(image_path),
            }]
        }, api_key=self.ocr_api_key)


def extract_spans_via_nvidia(
    page_image_path: str,
    page: int,
    client: NvidiaVisionClient | None = None,
) -> OcrExtractionResult:
    active_client = client if client is not None else NvidiaVisionClient.from_env()
    if active_client is None:
        return OcrExtractionResult(
            available=False,
            spans=[],
            message="NVIDIA_API_KEY belum tersedia untuk OCR/vision NVIDIA.",
        )

    width, height = _image_size(page_image_path)
    if os.getenv("NVIDIA_DRAWING_ENABLE_FAST_VISUAL", "").strip().lower() in {"1", "true", "yes"}:
        try:
            # Best-effort page classification. The extracted text path below remains source of truth.
            active_client.infer_fast_visual(page_image_path)
        except Exception:
            pass

    try:
        parse_payload = active_client.infer_parse(page_image_path)
        parse_spans = parse_nemotron_parse_payload(parse_payload, page=page, width=width, height=height)
        if parse_spans:
            return OcrExtractionResult(
                available=True,
                spans=parse_spans,
                message="NVIDIA nemotron-parse menghasilkan span OCR.",
            )
    except (error.URLError, TimeoutError, OSError, ValueError, KeyError, IndexError, TypeError, json.JSONDecodeError):
        pass

    try:
        ocr_payload = active_client.infer_ocr(page_image_path)
        ocr_spans = parse_nemotron_ocr_v2_payload(ocr_payload, page=page, width=width, height=height)
        if ocr_spans:
            return OcrExtractionResult(
                available=True,
                spans=ocr_spans,
                message="NVIDIA nemotron-ocr-v2 menghasilkan span OCR.",
            )
    except (error.URLError, TimeoutError, OSError, ValueError, KeyError, IndexError, TypeError, json.JSONDecodeError):
        pass

    return OcrExtractionResult(
        available=False,
        spans=[],
        message="NVIDIA OCR/parse tidak menghasilkan teks; fallback ke OCR lokal bila tersedia.",
    )
