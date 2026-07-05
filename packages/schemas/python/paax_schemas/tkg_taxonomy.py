from __future__ import annotations

from typing import Optional

PREFIKS: tuple[tuple[str, str], ...] = (
    ("LATEI", "latei"),
    ("LINTEL", "latei"),
    ("GORDING", "gording"),
    ("DB", "dinding_beton"),
    ("DW", "dinding_beton"),
    ("PC", "pondasi_telapak"),
    ("SL", "sloof"),
    ("KP", "kolom_praktis"),
    ("RB", "ring_balok"),
    ("CG", "balok"),
    ("CB", "balok"),
    ("BL", "latei"),
    ("LT", "latei"),
    ("TG", "tangga"),
    ("KD", "kuda_kuda"),
    ("JR", "kuda_kuda"),
    ("GD", "gording"),
    ("IA", "ikatan_angin"),
    ("TS", "trekstang"),
    ("P", "pondasi_telapak"),
    ("F", "pondasi_telapak"),
    ("K", "kolom"),
    ("G", "balok"),
    ("B", "balok"),
    ("S", "plat"),
)


def kategori_dari_kode(kode: str) -> Optional[str]:
    up = kode.strip().upper()
    for prefiks, kategori in PREFIKS:
        if up.startswith(prefiks):
            sisa = up[len(prefiks):]
            if sisa == "" or sisa[0].isdigit():
                return kategori
    return None


def known_tkg_categories() -> set[str]:
    return {category for _prefix, category in PREFIKS}
