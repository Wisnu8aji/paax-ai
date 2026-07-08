# NVIDIA Drawing Vision OCR Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Drawing Intelligence actually call NVIDIA vision/OCR models for raster/low-confidence pages, not only list them in config.

**Architecture:** Keep PAAX's deterministic PyMuPDF/grid/grammar/work-item pipeline as the source of truth. Add a small NVIDIA vision adapter that converts page PNGs into `TextSpan` objects using `nemotron-parse` and `nemotron-ocr-v2`, with graceful fallback to PaddleOCR and then manual review if external calls fail.

**Tech Stack:** Python stdlib `urllib`, PyMuPDF page rendering already present, existing `TextSpan`/`OcrExtractionResult`, NVIDIA hosted endpoints.

## Global Constraints

- Do not replace the existing vector PDF path.
- Do not let AI calculate final RAB, price, tax, subtotal, or total.
- Do not trust OCR/parse output as quantity by itself; route extracted text back into PAAX grammar and work-item logic.
- Keep failures graceful: no NVIDIA key, timeout, HTTP error, malformed response, or unsupported endpoint must not crash `/drawings/analyze`.

---

### Task 1: NVIDIA Vision Adapter

**Files:**
- Create: `services/document-intelligence/app/perception/ocr/nvidia_vision_extractor.py`
- Test: `services/document-intelligence/tests/test_perception_nvidia_vision_extractor.py`

**Interfaces:**
- Consumes: page PNG path and page index.
- Produces: `extract_spans_via_nvidia(page_image_path: str, page: int) -> OcrExtractionResult`.

- [x] **Step 1: Write failing tests**
  - Parse `nemotron-parse` `tool_calls[].function.arguments` containing `markdown_bbox`.
  - Parse `nemotron-ocr-v2` `data[].text_detections[]`.
  - Verify missing API key returns `available=False`.

- [x] **Step 2: Implement adapter**
  - Use `https://integrate.api.nvidia.com/v1/chat/completions` for `nvidia/nemotron-parse`.
  - Use `https://ai.api.nvidia.com/v1/cv/nvidia/nemotron-ocr-v2` for OCR v2.
  - Convert relative bounding boxes to pixel-style `TextSpan.bbox`.

- [x] **Step 3: Verify tests pass**
  - Run `python -m pytest services/document-intelligence/tests/test_perception_nvidia_vision_extractor.py -q`.

### Task 2: Wire Raster Path

**Files:**
- Modify: `services/document-intelligence/app/perception/assemble.py`
- Test: `services/document-intelligence/tests/test_perception_assemble.py` or focused existing tests.

**Interfaces:**
- Consumes: `extract_spans_via_nvidia`.
- Produces: raster pages try NVIDIA first, then PaddleOCR.

- [x] **Step 1: Write failing test or extend OCR test**
  - Monkeypatch NVIDIA extractor to return a span and PaddleOCR to fail; assert raster branch uses NVIDIA span.

- [x] **Step 2: Implement minimal wire**
  - In raster branch, call NVIDIA extractor before PaddleOCR.
  - If NVIDIA returns `available=True`, use those spans.
  - If NVIDIA fails, continue to existing PaddleOCR path.

- [x] **Step 3: Verify document-intelligence tests pass**
  - Run `python -m pytest services/document-intelligence/tests -q`.

### Task 3: Observability

**Files:**
- Modify: `services/document-intelligence/app/api/health_routes.py`
- Modify: `services/document-intelligence/app/perception/ai_report.py`

**Interfaces:**
- Produces health metadata showing which Drawing model stage is configured and which external model is actively used for raster OCR.

- [x] **Step 1: Keep health model map visible**
  - Ensure `/health` lists fast, parse, OCR backup, review, and civil reasoning model IDs.

- [x] **Step 2: Keep `model_stack` in AI report**
  - UI sees the stack without raw OCR debug.

- [x] **Step 3: Verify API health manually after restart**
  - Run `Invoke-RestMethod http://127.0.0.1:8083/health`.
