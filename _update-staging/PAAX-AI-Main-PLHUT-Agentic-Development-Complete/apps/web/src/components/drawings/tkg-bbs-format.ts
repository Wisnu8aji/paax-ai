type BbsLike = {
  marks?: unknown[];
  per_diameter?: unknown[];
  [key: string]: unknown;
} | null | undefined;

export function formatTkgBbsNumber(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "-";
  return value.toLocaleString("id-ID", { maximumFractionDigits: 4 });
}

export function hasTkgBbs(bbs: BbsLike): boolean {
  return Boolean((bbs?.marks?.length ?? 0) > 0 || (bbs?.per_diameter?.length ?? 0) > 0);
}
