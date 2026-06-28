"use client";

import { useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  ShieldCheck,
  Sparkles,
  Upload,
} from "lucide-react";
import type { SectionedRABResult, ValidationResult } from "@paax/schemas";

import { Button, Modal, StatusPill } from "@/components/ui";
import { buildSectionedRAB, getHSPDetail, validateRAB, type AHSPListItem } from "@/lib/engine";
import { formatPercent, formatRupiah } from "@/lib/format";
import { parseRabImportFile } from "@/lib/smart-import/smart-import-file";
import {
  detectPriceAnomalies,
  guessColumnMapping,
  importedLinesToEngineLines,
  mapRowsToRabDraft,
  mergeManualAhspCorrections,
  PRICE_ANOMALY_THRESHOLD,
  type ColumnMapping,
  type ImportedRabLine,
  type ParsedRabTable,
  type PriceAnomaly,
} from "@/lib/smart-import/smart-import";

type BusyKey = "file" | "engine";

const FIELDS: Array<[keyof ColumnMapping, string]> = [
  ["description", "Uraian"],
  ["volume", "Volume"],
  ["unit", "Satuan"],
  ["unit_price", "Harga satuan"],
  ["ahsp_code", "Kode AHSP"],
];

export function SmartRabImport({
  open,
  onClose,
  ahspList,
  regionCode,
  ppnRate,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  ahspList: AHSPListItem[];
  regionCode: string;
  ppnRate: number;
  onApply: (lines: { ahsp_code: string; volume: number }[]) => void;
}) {
  const [fileName, setFileName] = useState("");
  const [table, setTable] = useState<ParsedRabTable | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({
    description: null,
    volume: null,
    unit: null,
    unit_price: null,
    ahsp_code: null,
  });
  const [provider, setProvider] = useState<string | null>(null);
  const [lines, setLines] = useState<ImportedRabLine[]>([]);
  const [built, setBuilt] = useState<SectionedRABResult | null>(null);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [anomalies, setAnomalies] = useState<PriceAnomaly[]>([]);
  const [busy, setBusy] = useState<Record<BusyKey, boolean>>({ file: false, engine: false });
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File | null) {
    if (!file) return;
    setError(null);
    setBusy((b) => ({ ...b, file: true }));
    setFileName(file.name);
    setLines([]);
    setBuilt(null);
    setValidation(null);
    setAnomalies([]);
    try {
      const parsed = await parseRabImportFile(file);
      if (!parsed.headers.length) throw new Error("File tidak memiliki header tabel.");
      setTable(parsed);
      const guessed = guessColumnMapping(parsed.headers);
      setMapping(guessed);
      const res = await fetch("/api/ai/import-map", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ headers: parsed.headers, sampleRows: parsed.rows.slice(0, 5) }),
      });
      if (res.ok) {
        const data = (await res.json()) as { provider: string; mapping: ColumnMapping };
        setProvider(data.provider);
        setMapping(data.mapping);
      } else {
        setProvider("rule-based");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal membaca file import.");
    } finally {
      setBusy((b) => ({ ...b, file: false }));
    }
  }

  function patchMapping(field: keyof ColumnMapping, value: string) {
    setMapping((m) => ({ ...m, [field]: value || null }));
    setLines([]);
    setBuilt(null);
    setValidation(null);
    setAnomalies([]);
  }

  function patchLine(rowIndex: number, patch: Partial<ImportedRabLine>) {
    setLines((current) => current.map((line) => (line.row_index === rowIndex ? { ...line, ...patch } : line)));
    setBuilt(null);
    setValidation(null);
    setAnomalies([]);
  }

  async function handleEngine() {
    if (!table) return;
    setError(null);
    setBusy((b) => ({ ...b, engine: true }));
    try {
      const mapped = mergeManualAhspCorrections(
        mapRowsToRabDraft({ ...table, mapping, ahspList }),
        lines,
      );
      setLines(mapped);
      const engineLines = importedLinesToEngineLines(mapped);
      if (!engineLines.length) throw new Error("Belum ada item dengan AHSP dan volume valid.");

      const [sectioned, health] = await Promise.all([
        buildSectionedRAB(engineLines, regionCode, ppnRate),
        validateRAB(engineLines, regionCode, ppnRate),
      ]);
      setBuilt(sectioned);
      setValidation(health);

      const codes = [...new Set(mapped.map((line) => line.ahsp_code).filter((code): code is string => Boolean(code)))];
      const details = await Promise.all(codes.map(async (code) => [code, await getHSPDetail(code, regionCode)] as const));
      const references = Object.fromEntries(details.map(([code, hsp]) => [code, { hsp: hsp.hsp, name: hsp.name }]));
      const flagged = detectPriceAnomalies(mapped, references, PRICE_ANOMALY_THRESHOLD);
      if (flagged.length) {
        const res = await fetch("/api/ai/price-justification", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ anomalies: flagged }),
        });
        if (res.ok) {
          const data = (await res.json()) as { justifications: Array<{ row_index: number; justification: string }> };
          const byRow = new Map(data.justifications.map((item) => [item.row_index, item.justification]));
          setAnomalies(flagged.map((item) => ({ ...item, justification: byRow.get(item.row_index) })));
        } else {
          setAnomalies(flagged);
        }
      } else {
        setAnomalies([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menjalankan Smart Import.");
    } finally {
      setBusy((b) => ({ ...b, engine: false }));
    }
  }

  function handleApply() {
    const ready = importedLinesToEngineLines(lines);
    onApply(ready.map((line) => ({ ahsp_code: line.ahsp_code, volume: line.volume })));
    onClose();
  }

  const readyCount = importedLinesToEngineLines(lines).length;

  return (
    <Modal open={open} onClose={onClose} title="Smart Import RAB" width={980}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <StatusPill tone={provider?.includes("gemini") ? "ok" : "warn"}>
            <Sparkles size={12} /> {provider ?? "belum dianalisa"}
          </StatusPill>
          <StatusPill tone="neutral">Anomali harga ±{formatPercent(PRICE_ANOMALY_THRESHOLD * 100)}</StatusPill>
        </div>

        {error && (
          <div style={{ display: "flex", gap: 8, padding: 10, borderRadius: 10, border: "1px solid var(--warn-bd)", background: "var(--warn-bg)", color: "var(--warn-fg)", fontSize: 12.5 }}>
            <AlertTriangle size={15} /> {error}
          </div>
        )}

        <label style={{ display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
          <input
            type="file"
            accept=".csv,.xlsx,.xls,.pdf"
            style={{ display: "none" }}
            onChange={(e) => void handleFile(e.target.files?.[0] ?? null)}
          />
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 7,
              height: 38,
              padding: "0 16px",
              borderRadius: 10,
              fontWeight: 700,
              fontSize: 12.5,
              background: "var(--surface)",
              color: "var(--text)",
              border: "1px solid var(--border)",
              whiteSpace: "nowrap",
            }}
          >
            {busy.file ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />} Pilih file RAB
          </span>
          {fileName && <span style={{ fontSize: 12, color: "var(--text2)" }}>{fileName}</span>}
        </label>

        {table && (
          <div style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", marginBottom: 10 }}>
              Review mapping kolom
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(120px, 1fr))", gap: 8 }}>
              {FIELDS.map(([field, label]) => (
                <label key={field} style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 11, color: "var(--text3)" }}>
                  {label}
                  <select
                    className="pax-input"
                    value={mapping[field] ?? ""}
                    onChange={(e) => patchMapping(field, e.target.value)}
                  >
                    <option value="">- kosong -</option>
                    {table.headers.map((header) => <option key={header} value={header}>{header}</option>)}
                  </select>
                </label>
              ))}
            </div>
            <div style={{ marginTop: 10 }}>
              <Button onClick={handleEngine} disabled={busy.engine || !mapping.description || !mapping.volume}>
                {busy.engine ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />} Validasi dengan engine
              </Button>
            </div>
          </div>
        )}

        {lines.length > 0 && (
          <ImportedRowsTable lines={lines} ahspList={ahspList} onPatch={patchLine} />
        )}

        {validation && (
          <div style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <CheckCircle2 size={16} color={validation.ok ? "var(--ok-dot)" : "var(--warn-fg)"} />
              <strong style={{ color: "var(--text)", fontSize: 13 }}>Health Check Engine: {validation.score}/100</strong>
              <span style={{ color: "var(--text3)", fontSize: 12 }}>{validation.errors} error, {validation.warnings} peringatan</span>
            </div>
            {validation.issues.slice(0, 5).map((issue, i) => (
              <div key={i} style={{ marginTop: 6, color: "var(--text2)", fontSize: 12 }}>
                {issue.severity}: {issue.message}
              </div>
            ))}
          </div>
        )}

        {anomalies.length > 0 && (
          <div style={{ border: "1px solid var(--warn-bd)", borderRadius: 10, padding: 12, background: "var(--warn-bg)" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--warn-fg)", marginBottom: 8 }}>
              Anomali harga impor
            </div>
            {anomalies.map((item) => (
              <div key={`${item.row_index}-${item.ahsp_code}`} style={{ fontSize: 12, color: "var(--text)", marginTop: 6 }}>
                <strong>{item.description}</strong> {item.direction === "above" ? "di atas" : "di bawah"} acuan:
                {" "}{formatRupiah(item.imported_unit_price)} vs {formatRupiah(item.reference_hsp)}
                {" "}({formatPercent(item.deviation_pct)}).
                {item.justification && <div style={{ color: "var(--text2)", marginTop: 2 }}>{item.justification}</div>}
              </div>
            ))}
          </div>
        )}

        {built && (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid var(--border)", paddingTop: 12 }}>
            <div style={{ color: "var(--text2)", fontSize: 12 }}>
              {readyCount} item siap diterapkan. Total engine: <strong>{formatRupiah(built.total)}</strong>
            </div>
            <Button onClick={handleApply} disabled={!readyCount}>
              Terapkan ke editor <ArrowRight size={15} />
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}

function ImportedRowsTable({
  lines,
  ahspList,
  onPatch,
}: {
  lines: ImportedRabLine[];
  ahspList: AHSPListItem[];
  onPatch: (rowIndex: number, patch: Partial<ImportedRabLine>) => void;
}) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr>
            {["Uraian", "Volume", "Harga impor", "AHSP", "Status"].map((head) => (
              <th key={head} style={{ textAlign: "left", padding: "8px 10px", borderBottom: "1px solid var(--border)", color: "var(--text3)" }}>{head}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.row_index} style={{ background: line.needs_review ? "var(--warn-bg)" : "transparent" }}>
              <td style={{ padding: "8px 10px", borderBottom: "1px solid var(--border-soft)", color: "var(--text)" }}>
                {line.description}
                <div style={{ fontSize: 10.5, color: "var(--text3)" }}>{line.reason}</div>
              </td>
              <td className="pax-mono" style={{ padding: "8px 10px", borderBottom: "1px solid var(--border-soft)" }}>{line.volume} {line.unit ?? ""}</td>
              <td className="pax-mono" style={{ padding: "8px 10px", borderBottom: "1px solid var(--border-soft)" }}>{line.imported_unit_price === null ? "-" : formatRupiah(line.imported_unit_price)}</td>
              <td style={{ padding: "8px 10px", borderBottom: "1px solid var(--border-soft)" }}>
                <select
                  className="pax-input"
                  style={{ minWidth: 220, height: 30, fontSize: 11 }}
                  value={line.ahsp_code ?? ""}
                  onChange={(e) => onPatch(line.row_index, {
                    ahsp_code: e.target.value || null,
                    confidence: e.target.value ? 1 : 0.25,
                    reason: e.target.value ? "Kode AHSP dikoreksi pengguna." : "AHSP belum dipilih.",
                    needs_review: !e.target.value,
                  })}
                >
                  <option value="">- pilih manual -</option>
                  {ahspList.map((item) => <option key={item.code} value={item.code}>{item.code} - {item.name}</option>)}
                </select>
              </td>
              <td style={{ padding: "8px 10px", borderBottom: "1px solid var(--border-soft)" }}>
                <StatusPill tone={line.needs_review ? "warn" : "ok"}>{line.needs_review ? "review" : "siap"}</StatusPill>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
