"""
Formatting utilities — Indonesian currency, date, and number formatting.
"""

from __future__ import annotations

import locale
from datetime import date, datetime


def format_currency(value: float) -> str:
    """Format a number as Indonesian Rupiah, e.g. 'Rp 1.500.000'."""
    if value < 0:
        return f"-Rp {abs(value):,.0f}".replace(",", ".")
    return f"Rp {value:,.0f}".replace(",", ".")


def format_number(value: float, decimals: int = 2) -> str:
    """Format a number with Indonesian thousand separator (dot) and decimal (comma)."""
    formatted = f"{value:,.{decimals}f}"
    # Swap separators: 1,234.56 → 1.234,56
    parts = formatted.split(".")
    integer_part = parts[0].replace(",", ".")
    if len(parts) > 1:
        return f"{integer_part},{parts[1]}"
    return integer_part


def format_date_id(d: date | datetime) -> str:
    """Format a date in Indonesian style: '21 Juni 2026'."""
    _BULAN = [
        "", "Januari", "Februari", "Maret", "April", "Mei", "Juni",
        "Juli", "Agustus", "September", "Oktober", "November", "Desember",
    ]
    if isinstance(d, datetime):
        d = d.date()
    return f"{d.day} {_BULAN[d.month]} {d.year}"


def format_percentage(value: float) -> str:
    """Format as percentage: 0.11 → '11%'."""
    return f"{value * 100:.0f}%"
