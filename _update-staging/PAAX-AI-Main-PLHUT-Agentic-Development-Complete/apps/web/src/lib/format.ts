/**
 * Formatting utilities for the PAAX dashboard with Indonesian locale support.
 */

function parseNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const num = typeof value === 'number' ? value : Number(value);
  if (isNaN(num)) return null;
  return num;
}

export function formatRupiah(amount: number | string | null | undefined): string {
  const num = parseNumber(amount);
  if (num === null) return '-';
  try {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(num);
  } catch (error) {
    return '-';
  }
}

/**
 * Format ringkas untuk kartu KPI: "Rp 32,48 M" (miliar) / "Rp 1,2 T" / "Rp 850 jt".
 * Murni format TAMPILAN atas nilai yang sudah tersimpan — bukan perhitungan.
 */
export function formatRupiahCompact(amount: number | string | null | undefined): string {
  const num = parseNumber(amount);
  if (num === null) return '-';
  const abs = Math.abs(num);
  if (abs >= 1e12) return `Rp ${formatNumber(num / 1e12, 2)} T`;
  if (abs >= 1e9) return `Rp ${formatNumber(num / 1e9, 2)} M`;
  if (abs >= 1e6) return `Rp ${formatNumber(num / 1e6, 1)} jt`;
  return formatRupiah(num);
}

export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '-';
  try {
    const d = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(d.getTime())) return '-';
    return new Intl.DateTimeFormat('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(d);
  } catch (error) {
    return '-';
  }
}

export function formatNumber(
  value: number | string | null | undefined,
  decimals?: number
): string {
  const num = parseNumber(value);
  if (num === null) return '-';
  try {
    return new Intl.NumberFormat('id-ID', {
      minimumFractionDigits: 0,
      maximumFractionDigits: decimals !== undefined ? decimals : 3,
    }).format(num);
  } catch (error) {
    return '-';
  }
}

export function formatPercent(value: number | string | null | undefined): string {
  const num = parseNumber(value);
  if (num === null) return '-';
  try {
    return new Intl.NumberFormat('id-ID', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(num) + '%';
  } catch (error) {
    return '-';
  }
}

export function formatPercentage(
  value: number | string | null | undefined,
  decimals: number = 1
): string {
  const num = parseNumber(value);
  if (num === null) return '-';
  return formatNumber(num, decimals) + '%';
}
