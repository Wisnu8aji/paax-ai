import type { ProjectDemSheetResponse } from '../drawing-intelligence-api';
import type { ProjectSheetMapping } from './di-types';
export type { ProjectSheetMapping as MappedProjectSheet } from './di-types';

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function optionalNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Maps only fields returned by DEM; unknown stays null and is never inferred. */
export function mapProjectDemSheet(sheet: ProjectDemSheetResponse): ProjectSheetMapping {
  return {
    id: `${sheet.run_id}-page-${sheet.page_index}`,
    runId: sheet.run_id,
    pageIndex: sheet.page_index,
    number: optionalString(sheet.sheet_number),
    title: optionalString(sheet.sheet_title),
    discipline: optionalString(sheet.discipline),
    level: optionalString(sheet.level),
    scale: optionalString(sheet.scale),
    revision: optionalString(sheet.revision),
    confidence: optionalNumber(sheet.confidence),
    status: sheet.status,
    imageUrl: (() => {
      const url = optionalString(sheet.thumbnail_url);
      if (!url) return null;
      return url.startsWith('/projects/') ? `/api/drawing-intelligence${url}` : url;
    })(),
  };
}
