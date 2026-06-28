import type { AHSPListItem, EngineLine } from "@/lib/engine";

export const PRICE_ANOMALY_THRESHOLD = 0.2;

export interface ParsedRabTable {
  headers: string[];
  rows: string[][];
}

export interface ColumnMapping {
  description: string | null;
  volume: string | null;
  unit: string | null;
  unit_price: string | null;
  ahsp_code: string | null;
}

export interface ImportedRabLine {
  row_index: number;
  description: string;
  unit: string | null;
  volume: number;
  imported_unit_price: number | null;
  ahsp_code: string | null;
  confidence: number;
  reason: string;
  needs_review: boolean;
}

export interface PriceReference {
  hsp: number;
  name: string;
}

export interface PriceAnomaly {
  row_index: number;
  description: string;
  ahsp_code: string;
  imported_unit_price: number;
  reference_hsp: number;
  deviation_pct: number;
  threshold_pct: number;
  direction: "above" | "below";
  justification?: string;
}

function normalizeHeader(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (ch === "," && !quoted) {
      cells.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  return cells;
}

export function parseCsvText(text: string): ParsedRabTable {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);
  if (!lines.length) return { headers: [], rows: [] };
  const headers = splitCsvLine(lines[0]);
  const rows = lines.slice(1).map(splitCsvLine);
  return { headers, rows };
}

function pickHeader(headers: string[], patterns: RegExp[]): string | null {
  return headers.find((header) => patterns.some((pattern) => pattern.test(normalizeHeader(header)))) ?? null;
}

export function guessColumnMapping(headers: string[]): ColumnMapping {
  return {
    description: pickHeader(headers, [/uraian|pekerjaan|deskripsi|item|nama/]),
    volume: pickHeader(headers, [/^vol$|volume|qty|kuantitas|jumlah/]),
    unit: pickHeader(headers, [/^sat$|satuan|unit/]),
    unit_price: pickHeader(headers, [/harga\s*satuan|harsat|unit\s*price|harga/]),
    ahsp_code: pickHeader(headers, [/kode|ahsp|analisa/]),
  };
}

export function parseImportNumber(value: string | null | undefined): number | null {
  if (!value) return null;
  const cleaned = value
    .replace(/rp/gi, "")
    .replace(/\s/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function cell(row: string[], headers: string[], key: string | null): string {
  if (!key) return "";
  const index = headers.indexOf(key);
  return index >= 0 ? row[index] ?? "" : "";
}

function tokenSet(text: string): Set<string> {
  return new Set(normalizeHeader(text).split(/\s+/).filter(Boolean));
}

function similarity(a: string, b: string): number {
  const aa = tokenSet(a);
  const bb = tokenSet(b);
  const union = new Set([...aa, ...bb]).size || 1;
  let overlap = 0;
  for (const token of aa) {
    if (bb.has(token)) overlap += 1;
  }
  return overlap / union;
}

function matchAhsp(description: string, explicitCode: string, ahspList: AHSPListItem[]) {
  const direct = explicitCode.trim();
  if (direct && ahspList.some((item) => item.code === direct)) {
    return { code: direct, confidence: 1, reason: "Kode AHSP berasal dari file impor." };
  }
  const candidates = ahspList
    .map((item) => ({ item, score: similarity(description, item.name) }))
    .sort((a, b) => b.score - a.score);
  const best = candidates[0];
  if (best && best.score >= 0.45) {
    return {
      code: best.item.code,
      confidence: Math.min(0.95, Math.max(0.7, best.score)),
      reason: `Uraian paling mirip dengan ${best.item.code}.`,
    };
  }
  return { code: null, confidence: 0.25, reason: "AHSP belum yakin; pilih manual." };
}

export function mapRowsToRabDraft({
  headers,
  rows,
  mapping,
  ahspList,
}: {
  headers: string[];
  rows: string[][];
  mapping: ColumnMapping;
  ahspList: AHSPListItem[];
}): ImportedRabLine[] {
  return rows
    .map((row, index): ImportedRabLine | null => {
      const description = cell(row, headers, mapping.description).trim();
      const volume = parseImportNumber(cell(row, headers, mapping.volume));
      if (!description || volume === null || volume <= 0) return null;
      const importedPrice = parseImportNumber(cell(row, headers, mapping.unit_price));
      const matched = matchAhsp(description, cell(row, headers, mapping.ahsp_code), ahspList);
      return {
        row_index: index,
        description,
        unit: cell(row, headers, mapping.unit).trim() || null,
        volume,
        imported_unit_price: importedPrice,
        ahsp_code: matched.code,
        confidence: matched.confidence,
        reason: matched.reason,
        needs_review: matched.confidence < 0.65 || !matched.code,
      };
    })
    .filter((line): line is ImportedRabLine => line !== null);
}

export function importedLinesToEngineLines(lines: ImportedRabLine[]): EngineLine[] {
  return lines
    .filter((line) => line.ahsp_code && line.volume > 0)
    .map((line) => ({ ahsp_code: line.ahsp_code as string, volume: line.volume }));
}

export function mergeManualAhspCorrections(
  mapped: ImportedRabLine[],
  current: ImportedRabLine[],
): ImportedRabLine[] {
  const byRow = new Map(current.map((line) => [line.row_index, line]));
  return mapped.map((line) => {
    const previous = byRow.get(line.row_index);
    if (!previous || previous.ahsp_code === line.ahsp_code) return line;
    return {
      ...line,
      ahsp_code: previous.ahsp_code,
      confidence: previous.ahsp_code ? 1 : 0.25,
      reason: previous.ahsp_code ? "Kode AHSP dikoreksi pengguna." : "AHSP belum dipilih.",
      needs_review: !previous.ahsp_code,
    };
  });
}

export function detectPriceAnomalies(
  imported: Array<Pick<ImportedRabLine, "row_index" | "description" | "ahsp_code" | "imported_unit_price">>,
  references: Record<string, PriceReference>,
  threshold = PRICE_ANOMALY_THRESHOLD,
): PriceAnomaly[] {
  return imported.flatMap((line) => {
    if (!line.ahsp_code || line.imported_unit_price === null) return [];
    const reference = references[line.ahsp_code];
    if (!reference || reference.hsp <= 0) return [];
    const deviation = (line.imported_unit_price - reference.hsp) / reference.hsp;
    if (Math.abs(deviation) <= threshold) return [];
    return [{
      row_index: line.row_index,
      description: line.description,
      ahsp_code: line.ahsp_code,
      imported_unit_price: line.imported_unit_price,
      reference_hsp: reference.hsp,
      deviation_pct: Number((deviation * 100).toFixed(2)),
      threshold_pct: Number((threshold * 100).toFixed(2)),
      direction: deviation > 0 ? "above" : "below",
    }];
  });
}
