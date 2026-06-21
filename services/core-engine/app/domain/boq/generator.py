"""
BOQ generator — transform RAB groups into a BOQ document.
"""

from __future__ import annotations

from app.domain.boq.models import BOQDocument, BOQItem, BOQSection
from app.domain.rab.models import RABGroup


def generate_boq_from_rab(project_id: str, groups: list[RABGroup]) -> BOQDocument:
    """
    Convert RAB groups/items into a formal BOQ document.

    The BOQ mirrors the RAB structure but uses sequential numbering
    and a slightly different presentation format.
    """
    sections: list[BOQSection] = []

    for idx, group in enumerate(groups, start=1):
        boq_items: list[BOQItem] = []
        for sub_idx, rab_item in enumerate(group.items, start=1):
            rab_item.hitung_jumlah()
            boq_items.append(
                BOQItem(
                    no=f"{idx}.{sub_idx}",
                    uraian=rab_item.uraian,
                    satuan=rab_item.satuan.value,
                    volume=rab_item.volume,
                    harga_satuan=rab_item.harga_satuan,
                    jumlah=rab_item.jumlah,
                )
            )

        section = BOQSection(
            nomor=str(idx),
            nama=group.nama,
            items=boq_items,
            subtotal=round(sum(i.jumlah for i in boq_items), 2),
        )
        sections.append(section)

    total = round(sum(s.subtotal for s in sections), 2)

    return BOQDocument(
        project_id=project_id,
        judul="Bill of Quantities",
        sections=sections,
        total=total,
    )
