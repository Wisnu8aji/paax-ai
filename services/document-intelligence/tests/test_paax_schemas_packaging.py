from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path


def test_paax_schemas_imports_without_pythonpath_from_document_intelligence_process():
    env = {key: value for key, value in os.environ.items() if key not in {"PYTHONPATH", "PYTHONHOME"}}
    service_root = Path(__file__).resolve().parents[1]

    result = subprocess.run(
        [
            sys.executable,
            "-c",
            "from paax_schemas.tkg_taxonomy import known_tkg_categories; "
            "from paax_schemas.wbs import section_title; "
            "assert 'gording' in known_tkg_categories(); "
            "assert section_title('II') == 'Pekerjaan Tanah'",
        ],
        cwd=service_root,
        env=env,
        text=True,
        capture_output=True,
        check=False,
    )

    assert result.returncode == 0, result.stderr
