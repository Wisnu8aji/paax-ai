# PAAX AI v0.2

PAAX AI is a Streamlit application with two modes:

- **General Chat:** the existing bilingual Gemini-powered chatbot.
- **RAB Lite:** a deterministic AHSP index and Excel workflow for Indonesian
  Cipta Karya / building-work cost assistance.

Live demo: **[Open PAAX AI](https://paax-ai.streamlit.app/)**

## What Changed in v0.2

RAB Lite adds structure that a general chatbot does not provide:

- A built-in synthetic AHSP index for site, structural, and architectural work
- A synthetic demo HSP unit-price library
- A fixed project-item input template
- Python-based validation, joins, subtotals, and totals
- Missing-code, unknown-code, unit, price, and quantity warnings
- Downloadable RAB output in Excel and CSV
- An optional Gemini explanation of assumptions and warnings

Gemini does not calculate final cost numbers. All quantities, unit prices,
subtotals, and totals are handled deterministically in Python.

## AHSP Index Approach

PAAX AI v0.2 intentionally does **not** parse or convert the full 1,563-page
AHSP PDF. It includes a small synthetic index in `data/ahsp/ahsp_index.csv`
plus a manifest that marks the records as demo and unverified. No official
AHSP content or official unit prices are bundled.

The current workflow joins:

```text
project_items.ahsp_code
  -> ahsp_index.ahsp_code
  -> hsp_library.ahsp_code
```

This validates the product workflow before a future official-data ingestion
or full AHSP coefficient engine is considered.

## Project Item Template

RAB Lite provides a downloadable Excel template with these columns:

| Column | Purpose |
| --- | --- |
| `item_name` | Project work item |
| `quantity` | Positive numeric volume or quantity |
| `unit` | Unit that must match the selected AHSP row |
| `ahsp_code` | Code from the bundled demo index |
| `notes` | Optional project note |

Users can also start with the built-in sample project items or upload
Excel/CSV.

## Excel Output

The generated workbook contains:

- `1_RINGKASAN` - total, item counts, and warning count
- `2_RAB` - calculated item table
- `3_AHSP_TERPAKAI` - AHSP/HSP references used by the estimate
- `4_WARNING` - row-level validation and lookup warnings
- `5_ASUMSI` - calculation and data assumptions
- `6_AUDIT_LOG` - calculation and data-classification events

## Using Private AHSP Extraction Files

Private AHSP extraction workbooks must stay outside the public demo dataset.
Place the three expected files in `data_private/ahsp/raw/`:

- `ahsp_ck_index_2026_v02.xlsx`
- `ahsp_ck_coeff_div1_2_v02.xlsx`
- `ahsp_ck_coeff_div3_arch_v02.xlsx`

Prepare normalized private outputs with:

```bash
python scripts/prepare_private_ahsp.py
```

The script validates the expected worksheets and columns, then writes
processed CSV files and `validation_report.xlsx` under
`data_private/ahsp/processed/`.

Enable the processed private AHSP index with:

```powershell
$env:PAAX_AHSP_DATA_MODE = "private"
streamlit run app.py
```

Use `PAAX_AHSP_DATA_MODE=demo` or leave it unset for the default public demo
mode. If private mode is requested but processed files are unavailable or
invalid, PAAX AI falls back to demo mode and shows a warning.

Do not commit official AHSP files or anything under `data_private/`. Public
synthetic demo data remains under `data/ahsp/`. The current private importer
does not add a private HSP price source, so RAB Lite continues to identify the
synthetic public HSP library separately.

## Run Locally

```bash
git clone https://github.com/your-username/paax-ai.git
cd paax-ai
python -m venv .venv
```

Activate the environment on Windows PowerShell:

```powershell
.\.venv\Scripts\Activate.ps1
```

Install dependencies and start Streamlit:

```bash
python -m pip install -r requirements.txt
streamlit run app.py
```

## Environment Setup

General Chat and the optional RAB explanation use the Gemini API. RAB
calculation and downloads work without Gemini.

Copy `.streamlit/secrets.toml.example` to `.streamlit/secrets.toml` and add
your own key:

```toml
GEMINI_API_KEY = "your_gemini_api_key_here"
```

The local secrets file is ignored by Git. Never commit API keys.

## Testing

```bash
python -m pytest
```

Tests mock Gemini SDK behavior and do not make real Gemini requests.

## Limitations

- The bundled AHSP index is synthetic demo data only.
- The bundled HSP unit prices are synthetic demo values only.
- Output is not a final professional RAB and must not be presented as one.
- Official AHSP data and local HSD/HSP must be independently verified.
- PAAX AI performs no drawing takeoff.
- v0.2 does not include a full AHSP coefficient engine.
- Quantities, specifications, taxes, overhead, profit, escalation, and local
  project conditions still require professional review.

## Safety and Privacy

- Do not enter confidential, sensitive, or personal information.
- Review AI explanations before using them for decisions.
- Treat every demo estimate as an auditable workflow example, not professional
  cost advice.

Current version: `0.2`
