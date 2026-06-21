# ADR 0004: Template-First Excel Export

## Status
Accepted

## Context
A critical feature of PAAX AI is exporting the generated RAB and Schedule into Excel format. Civil engineers expect highly formatted, standardized Excel files with specific branding, formulas, cell styles, and multiple sheets (Summary, Details, AHSP, Schedule).

Initially, we considered using AI to generate the layout or write Python code dynamically to format the Excel file.

## Decision
We will use a **Template-First** approach for Excel generation using `openpyxl` or similar deterministic libraries. 

We will maintain physical `.xlsx` template files in the repository (e.g., `templates/rab_standard.xlsx`). The Core Engine will load these templates, find named ranges or specific anchor cells, and strictly inject the deterministic data and formulas. 

We will **not** use LLMs to generate Excel layouts or styling.

## Consequences

### Positive
- **Professional Appearance**: Outputs look identical to standard corporate formats.
- **Reliable Formulas**: Excel formulas (e.g., `=SUM(B2:B10)`) are injected deterministically, so the resulting spreadsheet is fully functional and interactive for the end user.
- **Easy Updates**: If a user wants to change the corporate logo or column colors, we just update the `.xlsx` template file without touching code.
- **No Hallucinations**: Zero risk of AI breaking the spreadsheet structure or XML syntax.

### Negative
- **Inflexibility**: The system cannot spontaneously create a "new type of report" that isn't pre-templated without a developer adding a new template.
- **Maintenance**: Changes to the Core Engine's output schema require manual synchronization with the Excel templates.
