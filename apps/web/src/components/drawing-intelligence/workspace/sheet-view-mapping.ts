import type { Discipline, DrawingType, Sheet } from './di-types';

export interface LevelDisplay {
  floorId: string;
  floorLabel: string;
}

function normalized(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

export function resolveLevelDisplay(input: { level?: unknown; code?: unknown; title?: unknown }): LevelDisplay {
  const explicit = normalized(input.level).replace(/\s+/g, '');
  const combined = `${normalized(input.code)} ${normalized(input.title)}`;

  // Explicit backend metadata is authoritative for the display scope. Title
  // inference is only a fallback. Previously "level=foundation" paired with
  // a title containing "Pier Cap" was overwritten to generic Substruktur.
  if (['roof', 'atap', 'rooftop'].includes(explicit)) return { floorId: 'ROOF', floorLabel: 'Atap' };
  if (['superstructure'].includes(explicit)) return { floorId: 'SUPERSTRUCTURE', floorLabel: 'Superstruktur' };
  if (['substructure'].includes(explicit)) return { floorId: 'SUBSTRUCTURE', floorLabel: 'Substruktur' };
  if (['alignment'].includes(explicit)) return { floorId: 'ALIGNMENT', floorLabel: 'Trase/Alignment' };
  if (['foundation', 'fondasi'].includes(explicit)) return { floorId: 'FOUNDATION', floorLabel: 'Fondasi/Substruktur' };
  if (['site', 'tapak'].includes(explicit)) return { floorId: 'SITE', floorLabel: 'Area Tapak' };
  if (['ground', 'l0', 'f00', '0'].includes(explicit)) return { floorId: 'L0', floorLabel: 'Lantai Dasar' };
  if (['mezzanine', 'mezanin'].includes(explicit)) return { floorId: 'MEZZANINE', floorLabel: 'Mezanin' };

  const explicitBasement = explicit.match(/^b(\d{1,2})$/);
  if (explicitBasement) {
    const number = Number(explicitBasement[1]);
    return { floorId: `B${number}`, floorLabel: `Basement ${number}` };
  }
  const explicitFloor = explicit.match(/^[lf](\d{1,2})$/);
  if (explicitFloor) {
    const number = Number(explicitFloor[1]);
    return number === 0
      ? { floorId: 'L0', floorLabel: 'Lantai Dasar' }
      : { floorId: `L${number}`, floorLabel: `Lantai ${number}` };
  }

  if (/\b(roof|atap|rooftop)\b/.test(combined)) return { floorId: 'ROOF', floorLabel: 'Atap' };
  if (/\b(superstructure|girder|deck|bearing)\b/.test(combined)) return { floorId: 'SUPERSTRUCTURE', floorLabel: 'Superstruktur' };
  if (/\b(substructure|abutment|pier\s*cap|pier)\b/.test(combined)) return { floorId: 'SUBSTRUCTURE', floorLabel: 'Substruktur' };
  if (/\b(road\s+alignment|alignment\s+plan|plan\s+(?:and|&)\s+profile|longitudinal\s+profile|rencana\s+trase)\b/.test(combined)) return { floorId: 'ALIGNMENT', floorLabel: 'Trase/Alignment' };
  if (/\b(foundation|fondasi|footplat|pile\s*cap|sloof)\b/.test(combined)) return { floorId: 'FOUNDATION', floorLabel: 'Fondasi/Substruktur' };
  if (/\b(site\s*plan|situasi|rencana\s*tapak|paving|landscape)\b/.test(combined)) return { floorId: 'SITE', floorLabel: 'Area Tapak' };
  if (/\b(ground\s*floor|lantai\s*dasar|lantai\s*0|level\s*0|floor\s*0)\b/.test(combined)) return { floorId: 'L0', floorLabel: 'Lantai Dasar' };
  if (/\b(mezzanine|mezanin)\b/.test(combined)) return { floorId: 'MEZZANINE', floorLabel: 'Mezanin' };

  const basement = combined.match(/\b(?:basement|b)\s*[-.:]?\s*(\d{1,2})\b/);
  if (basement) {
    const number = Number(basement[1]);
    return { floorId: `B${number}`, floorLabel: `Basement ${number}` };
  }
  const floor = combined.match(/\b(?:lantai|lt\.?|level|floor)\s*[-.:]?\s*(\d{1,2})\b/);
  if (floor) {
    const number = Number(floor[1]);
    return number === 0
      ? { floorId: 'L0', floorLabel: 'Lantai Dasar' }
      : { floorId: `L${number}`, floorLabel: `Lantai ${number}` };
  }
  return { floorId: 'UNASSIGNED', floorLabel: 'Level belum teridentifikasi' };
}

export function resolveDisciplines(value: unknown): Discipline[] {
  const source = normalized(value);
  const result = new Set<Discipline>();
  if (/struct|struktur/.test(source)) result.add('STR');
  if (/arch|arsitektur|interior/.test(source)) result.add('ARC');
  if (/elect|elektr|mechan|mekan|plumb|sanitary|mep|hvac/.test(source)) result.add('MEP');
  if (/civil|sipil|site|landscape|road|jalan/.test(source)) result.add('CIV');
  return result.size > 0 ? [...result] : ['OTH'];
}

export function resolveDrawingType(value: unknown, title: unknown): DrawingType {
  const source = `${normalized(value)} ${normalized(title)}`;
  if (/schedule|tabel|daftar\s+(pintu|jendela|kolom|balok)/.test(source)) return 'Schedule';
  if (/reinforcement|rebar|pembesian|penulangan/.test(source)) return 'Reinforcement Detail';
  if (/typical\s+cross\s+section|cross\s+section|potongan\s+melintang/.test(source)) return 'Cross Section';
  if (/plan\s+(?:and|&)\s+profile|road\s+(?:plan|profile)|longitudinal\s+profile|alignment\s+plan|rencana\s+trase/.test(source)) return 'Road Plan / Profile';
  if (/bridge\s+(?:plan|general\s+arrangement)|general\s+arrangement\s+bridge|rencana\s+jembatan/.test(source)) return 'Bridge Plan';
  if (/general\s+arrangement|ga\s+drawing|layout\s+umum|tata\s+letak\s+umum/.test(source)) return 'General Arrangement';
  if (/section|potongan/.test(source)) return 'Section';
  if (/elevation|tampak/.test(source)) return 'Elevation';
  if (/detail/.test(source)) return 'Detail';
  if (/roof|atap/.test(source)) return 'Roof Plan';
  if (/site\s*plan|situasi|tapak|paving/.test(source)) return 'Site Plan';
  if (/diagram|schematic|skematik|single\s*line/.test(source)) return 'Diagram / Schematic';
  if (/foundation|fondasi|footing|pile\s*cap/.test(source)) return 'Foundation Plan';
  if (/framing|beam\s+plan|column\s+plan|denah\s+(?:balok|kolom|sloof)/.test(source)) return 'Framing Plan';
  if (/floor\s+plan|denah\s+lantai/.test(source)) return 'Floor Plan';
  if (/cover|index/.test(source)) return 'Cover / Index';
  if (/general\s+notes|catatan\s+umum/.test(source)) return 'General Notes';
  return 'Other / Unclassified';
}

export function mapRawDemSheetToSheet(item: any): Sheet {
  const rawTitle = String(item.sheet_title || item.title || '').trim();
  const match = rawTitle.match(/^([A-Za-z0-9._/-]+)\s*[-–]\s*(.*)$/);
  const code = String(item.sheet_number || item.number || (match ? match[1] : `PAGE-${Number(item.page_index ?? 0) + 1}`));
  const title = String(match ? match[2] : (rawTitle || `Halaman ${Number(item.page_index ?? 0) + 1}`));
  const level = resolveLevelDisplay({ level: item.level, code, title });
  const sourceWidth = typeof item.width_px === 'number' && item.width_px > 0 ? item.width_px : 1;
  const sourceHeight = typeof item.height_px === 'number' && item.height_px > 0 ? item.height_px : 1;
  return {
    id: `${item.run_id}-page-${item.page_index}`,
    fileId: item.run_id,
    runId: item.run_id,
    pageIndex: item.page_index,
    code,
    title,
    originalPageName: item.file_name || title,
    pageNumber: Number(item.page_index ?? 0) + 1,
    floorId: level.floorId,
    floorLabel: level.floorLabel,
    disciplines: resolveDisciplines(item.discipline),
    drawingType: resolveDrawingType(item.drawing_type, title),
    scale: item.scale || null,
    scaleConfirmed: Boolean(item.scale),
    revision: item.revision || null,
    status: item.status === 'complete' || item.status === 'completed' ? 'analyzed' : 'queued',
    reviewIssueCount: Number(item.review_issue_count || 0),
    sheetSize: item.width_px && item.height_px ? `${item.width_px} × ${item.height_px} px source` : 'Ukuran belum dilaporkan',
    analyzedOn: item.analyzed_on || item.completed_at || null,
    aiConfidence: typeof item.confidence === 'number' ? Math.round(item.confidence <= 1 ? item.confidence * 100 : item.confidence) : null,
    geometry: { widthMm: sourceWidth, heightMm: sourceHeight, gridX: [], gridY: [], rooms: [] },
    imageUrl: item.thumbnail_url || item.imageUrl || (item.run_id && item.page_index !== undefined ? `/api/document-intelligence/drawings/dem/${item.run_id}/pages/${item.page_index}/thumbnail?width=320` : null),
  };
}
