"""
Deterministic RAB calculator.

All financial computations are performed here — NEVER by the LLM.
Angka final dihitung oleh core-engine, bukan LLM.
"""

from __future__ import annotations

from app.domain.rab.models import (
    RABGroup,
    RABItem,
    RABSummary,
    RABVersion,
    GenerateRABRequest,
    KategoriPekerjaan,
    Satuan,
)


# ── Demo unit prices per m² by kelas ────────────────────────────────────────

_HARGA_PER_M2: dict[str, float] = {
    "sederhana": 3_500_000.0,
    "menengah": 5_500_000.0,
    "mewah": 9_000_000.0,
}

# ── Proportion of total cost allocated to each divisi ───────────────────────

_PROPORSI_DIVISI: dict[KategoriPekerjaan, float] = {
    KategoriPekerjaan.PERSIAPAN: 0.03,
    KategoriPekerjaan.TANAH: 0.05,
    KategoriPekerjaan.PONDASI: 0.12,
    KategoriPekerjaan.STRUKTUR: 0.25,
    KategoriPekerjaan.DINDING: 0.10,
    KategoriPekerjaan.LANTAI: 0.08,
    KategoriPekerjaan.ATAP: 0.10,
    KategoriPekerjaan.PINTU_JENDELA: 0.07,
    KategoriPekerjaan.PLAFON: 0.04,
    KategoriPekerjaan.SANITASI: 0.06,
    KategoriPekerjaan.MEP: 0.05,
    KategoriPekerjaan.FINISHING: 0.03,
    KategoriPekerjaan.LUAR: 0.02,
}

# ── Demo work items per category ────────────────────────────────────────────

_DEMO_ITEMS: dict[KategoriPekerjaan, list[dict]] = {
    KategoriPekerjaan.PERSIAPAN: [
        {"kode": "A.01", "uraian": "Pembersihan lahan & pengukuran", "satuan": Satuan.LS, "vol_factor": 1.0, "price_base": 1.0},
        {"kode": "A.02", "uraian": "Pemasangan bouwplank", "satuan": Satuan.M1, "vol_factor": 0.4, "price_base": 0.15},
    ],
    KategoriPekerjaan.TANAH: [
        {"kode": "B.01", "uraian": "Galian tanah pondasi", "satuan": Satuan.M3, "vol_factor": 0.3, "price_base": 0.4},
        {"kode": "B.02", "uraian": "Urugan pasir bawah pondasi", "satuan": Satuan.M3, "vol_factor": 0.1, "price_base": 0.3},
        {"kode": "B.03", "uraian": "Urugan tanah kembali", "satuan": Satuan.M3, "vol_factor": 0.15, "price_base": 0.3},
    ],
    KategoriPekerjaan.PONDASI: [
        {"kode": "C.01", "uraian": "Pondasi batu kali", "satuan": Satuan.M3, "vol_factor": 0.15, "price_base": 0.5},
        {"kode": "C.02", "uraian": "Sloof beton bertulang 20/30", "satuan": Satuan.M3, "vol_factor": 0.08, "price_base": 0.5},
    ],
    KategoriPekerjaan.STRUKTUR: [
        {"kode": "D.01", "uraian": "Kolom beton bertulang 30/30", "satuan": Satuan.M3, "vol_factor": 0.06, "price_base": 0.35},
        {"kode": "D.02", "uraian": "Balok beton bertulang 25/40", "satuan": Satuan.M3, "vol_factor": 0.08, "price_base": 0.35},
        {"kode": "D.03", "uraian": "Plat lantai beton t=12cm", "satuan": Satuan.M2, "vol_factor": 1.0, "price_base": 0.30},
    ],
    KategoriPekerjaan.DINDING: [
        {"kode": "E.01", "uraian": "Pasangan bata ringan tebal 10cm", "satuan": Satuan.M2, "vol_factor": 2.5, "price_base": 0.35},
        {"kode": "E.02", "uraian": "Plesteran dinding 1:4", "satuan": Satuan.M2, "vol_factor": 5.0, "price_base": 0.35},
        {"kode": "E.03", "uraian": "Acian dinding", "satuan": Satuan.M2, "vol_factor": 5.0, "price_base": 0.30},
    ],
    KategoriPekerjaan.LANTAI: [
        {"kode": "F.01", "uraian": "Pemasangan keramik lantai 60×60", "satuan": Satuan.M2, "vol_factor": 1.0, "price_base": 0.55},
        {"kode": "F.02", "uraian": "Pemasangan keramik KM/WC 30×30", "satuan": Satuan.M2, "vol_factor": 0.15, "price_base": 0.45},
    ],
    KategoriPekerjaan.ATAP: [
        {"kode": "G.01", "uraian": "Rangka atap baja ringan", "satuan": Satuan.M2, "vol_factor": 1.2, "price_base": 0.5},
        {"kode": "G.02", "uraian": "Penutup atap genteng metal", "satuan": Satuan.M2, "vol_factor": 1.2, "price_base": 0.4},
        {"kode": "G.03", "uraian": "Lisplang & talang", "satuan": Satuan.M1, "vol_factor": 0.3, "price_base": 0.10},
    ],
    KategoriPekerjaan.PINTU_JENDELA: [
        {"kode": "H.01", "uraian": "Pintu panel kayu + kusen", "satuan": Satuan.UNIT, "vol_factor": 0.05, "price_base": 0.30},
        {"kode": "H.02", "uraian": "Jendela aluminium + kaca", "satuan": Satuan.UNIT, "vol_factor": 0.06, "price_base": 0.40},
    ],
    KategoriPekerjaan.PLAFON: [
        {"kode": "I.01", "uraian": "Rangka plafon hollow galvanis", "satuan": Satuan.M2, "vol_factor": 1.0, "price_base": 0.45},
        {"kode": "I.02", "uraian": "Pemasangan plafon gypsum 9mm", "satuan": Satuan.M2, "vol_factor": 1.0, "price_base": 0.55},
    ],
    KategoriPekerjaan.SANITASI: [
        {"kode": "J.01", "uraian": "Instalasi pipa air bersih PPR", "satuan": Satuan.TITIK, "vol_factor": 0.08, "price_base": 0.25},
        {"kode": "J.02", "uraian": "Instalasi pipa air kotor PVC 4\"", "satuan": Satuan.TITIK, "vol_factor": 0.05, "price_base": 0.30},
        {"kode": "J.03", "uraian": "Kloset duduk + aksesoris", "satuan": Satuan.UNIT, "vol_factor": 0.02, "price_base": 0.45},
    ],
    KategoriPekerjaan.MEP: [
        {"kode": "K.01", "uraian": "Instalasi listrik titik lampu", "satuan": Satuan.TITIK, "vol_factor": 0.1, "price_base": 0.30},
        {"kode": "K.02", "uraian": "Instalasi stop kontak", "satuan": Satuan.TITIK, "vol_factor": 0.08, "price_base": 0.25},
        {"kode": "K.03", "uraian": "Panel listrik MCB", "satuan": Satuan.UNIT, "vol_factor": 0.01, "price_base": 0.45},
    ],
    KategoriPekerjaan.FINISHING: [
        {"kode": "L.01", "uraian": "Pengecatan dinding interior", "satuan": Satuan.M2, "vol_factor": 5.0, "price_base": 0.50},
        {"kode": "L.02", "uraian": "Pengecatan dinding eksterior", "satuan": Satuan.M2, "vol_factor": 2.5, "price_base": 0.50},
    ],
    KategoriPekerjaan.LUAR: [
        {"kode": "M.01", "uraian": "Paving block halaman", "satuan": Satuan.M2, "vol_factor": 0.3, "price_base": 0.50},
        {"kode": "M.02", "uraian": "Saluran drainase keliling", "satuan": Satuan.M1, "vol_factor": 0.25, "price_base": 0.50},
    ],
}

_NAMA_DIVISI: dict[KategoriPekerjaan, str] = {
    KategoriPekerjaan.PERSIAPAN: "Pekerjaan Persiapan",
    KategoriPekerjaan.TANAH: "Pekerjaan Tanah",
    KategoriPekerjaan.PONDASI: "Pekerjaan Pondasi",
    KategoriPekerjaan.STRUKTUR: "Pekerjaan Struktur",
    KategoriPekerjaan.DINDING: "Pekerjaan Dinding",
    KategoriPekerjaan.LANTAI: "Pekerjaan Lantai",
    KategoriPekerjaan.ATAP: "Pekerjaan Atap",
    KategoriPekerjaan.PINTU_JENDELA: "Pekerjaan Pintu & Jendela",
    KategoriPekerjaan.PLAFON: "Pekerjaan Plafon",
    KategoriPekerjaan.SANITASI: "Pekerjaan Sanitasi",
    KategoriPekerjaan.MEP: "Pekerjaan Mekanikal Elektrikal",
    KategoriPekerjaan.FINISHING: "Pekerjaan Finishing",
    KategoriPekerjaan.LUAR: "Pekerjaan Luar",
}


# ── Public API ──────────────────────────────────────────────────────────────

def calculate_summary(
    groups: list[RABGroup],
    ppn_rate: float = 0.11,
    contingency_rate: float = 0.05,
    overhead_profit_rate: float = 0.10,
) -> RABSummary:
    """
    Deterministic RAB summary calculation.

    subtotal           = Σ group.subtotal
    ppn                = subtotal × ppn_rate
    contingency        = subtotal × contingency_rate
    overhead_profit    = subtotal × overhead_profit_rate
    grand_total        = subtotal + ppn + contingency + overhead_profit
    """
    for group in groups:
        group.hitung_subtotal()

    subtotal = round(sum(g.subtotal for g in groups), 2)
    ppn = round(subtotal * ppn_rate, 2)
    contingency = round(subtotal * contingency_rate, 2)
    overhead_profit = round(subtotal * overhead_profit_rate, 2)
    grand_total = round(subtotal + ppn + contingency + overhead_profit, 2)

    return RABSummary(
        subtotal=subtotal,
        ppn_rate=ppn_rate,
        ppn=ppn,
        contingency_rate=contingency_rate,
        contingency=contingency,
        overhead_profit_rate=overhead_profit_rate,
        overhead_profit=overhead_profit,
        grand_total=grand_total,
    )


def generate_rab(request: GenerateRABRequest) -> RABVersion:
    """
    Generate a complete RAB from project parameters.

    Uses demo unit-price data and proportion-based estimation to produce
    a realistic RAB for an Indonesian building project.
    """
    harga_m2 = _HARGA_PER_M2.get(request.kelas_bangunan, _HARGA_PER_M2["menengah"])
    total_luas = request.luas_bangunan * request.jumlah_lantai
    estimasi_total = total_luas * harga_m2

    groups: list[RABGroup] = []

    for kategori, proporsi in _PROPORSI_DIVISI.items():
        budget_divisi = estimasi_total * proporsi
        demo_items = _DEMO_ITEMS.get(kategori, [])
        if not demo_items:
            continue

        items: list[RABItem] = []
        for di in demo_items:
            # Volume derived from luas × vol_factor, price from budget share
            volume = max(round(total_luas * di["vol_factor"], 2), 1.0)
            harga_satuan = round(budget_divisi * di["price_base"] / volume, 0)

            item = RABItem(
                kode=di["kode"],
                uraian=di["uraian"],
                satuan=di["satuan"],
                volume=volume,
                harga_satuan=harga_satuan,
                kategori=kategori,
            )
            item.hitung_jumlah()
            items.append(item)

        group = RABGroup(
            nama=_NAMA_DIVISI[kategori],
            kategori=kategori,
            items=items,
        )
        group.hitung_subtotal()
        groups.append(group)

    summary = calculate_summary(groups)

    return RABVersion(
        project_id=request.project_id,
        version=1,
        label="Draft — dibuat otomatis",
        groups=groups,
        summary=summary,
    )


def recalculate_rab(
    groups: list[RABGroup],
    ppn_rate: float = 0.11,
    contingency_rate: float = 0.05,
    overhead_profit_rate: float = 0.10,
) -> RABSummary:
    """Recalculate an existing RAB after user edits."""
    return calculate_summary(groups, ppn_rate, contingency_rate, overhead_profit_rate)
