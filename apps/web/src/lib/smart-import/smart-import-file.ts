"use client";

import * as XLSX from "xlsx";

import { parseCsvText, type ParsedRabTable } from "./smart-import";

function firstTable(rows: unknown[][]): ParsedRabTable {
  const normalized = rows
    .map((row) => row.map((cell) => (cell === null || cell === undefined ? "" : String(cell).trim())))
    .filter((row) => row.some((cell) => cell.length > 0));
  if (!normalized.length) return { headers: [], rows: [] };
  return { headers: normalized[0], rows: normalized.slice(1) };
}

export async function parseRabImportFile(file: File): Promise<ParsedRabTable> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf") || file.type === "application/pdf") {
    throw new Error("PDF belum didukung di Smart Import v0.8. Gunakan Excel (.xlsx/.xls) atau CSV.");
  }
  if (name.endsWith(".csv") || file.type.includes("csv")) {
    return parseCsvText(await file.text());
  }
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) return { headers: [], rows: [] };
    const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], { header: 1, blankrows: false });
    return firstTable(rows);
  }
  throw new Error("Format file belum didukung. Gunakan Excel (.xlsx/.xls) atau CSV.");
}
