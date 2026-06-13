"""Sample project input for the RAB Lite interface and tests."""

import pandas as pd


def get_sample_project_items() -> pd.DataFrame:
    """Return a small, fully calculable building-work example."""
    return pd.DataFrame(
        [
            {
                "item_name": "Pembersihan area bangunan",
                "quantity": 120,
                "unit": "m2",
                "ahsp_code": "CK-D1-001",
                "notes": "Sample quantity",
            },
            {
                "item_name": "Galian pondasi",
                "quantity": 24,
                "unit": "m3",
                "ahsp_code": "CK-D1-006",
                "notes": "Sample quantity",
            },
            {
                "item_name": "Beton sloof",
                "quantity": 5.5,
                "unit": "m3",
                "ahsp_code": "CK-D2-003",
                "notes": "Demo concrete class",
            },
            {
                "item_name": "Pembesian struktur",
                "quantity": 850,
                "unit": "kg",
                "ahsp_code": "CK-D2-007",
                "notes": "Sample quantity",
            },
            {
                "item_name": "Dinding bata ringan",
                "quantity": 180,
                "unit": "m2",
                "ahsp_code": "CK-D3-001",
                "notes": "Sample quantity",
            },
            {
                "item_name": "Pengecatan interior",
                "quantity": 360,
                "unit": "m2",
                "ahsp_code": "CK-D3-007",
                "notes": "Sample quantity",
            },
        ]
    )
