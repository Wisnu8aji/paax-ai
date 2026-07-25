import type { ElementTypeIndexEntry, ProjectGraphSummaryView } from '@paax/schemas';

/**
 * Tipe tampilan (view-model) untuk pohon Level → Disiplin → Tipe Elemen.
 * Semua angka di sini adalah SALINAN LANGSUNG dari payload summary-views
 * (occurrence_count tersimpan di engine/synthesis, bukan dihitung ulang di
 * frontend) — Aturan Emas §1 CLAUDE.md: UI tidak pernah menghitung.
 */
export interface DisciplineGroup {
  discipline: string;
  elementTypes: ElementTypeIndexEntry[];
  occurrenceTotal: number;
}

export interface LevelTreeNode {
  levelId: string;
  levelName: string;
  disciplines: DisciplineGroup[];
  totalOccurrences: number;
  confirmedCount: number;
  ambiguousBindingCount: number;
  conflictCount: number;
}

/**
 * Susun payload summary-views (LEVEL_OVERVIEW per level) menjadi pohon
 * Level → Disiplin → Tipe Elemen untuk panel kiri. Tidak ada agregasi
 * numerik baru: discipline_counts & element_type_index dipakai apa adanya.
 */
export function buildLevelTree(views: ProjectGraphSummaryView[]): LevelTreeNode[] {
  return views
    .map((view) => {
      const disciplineNames = view.summary.discipline_counts.map((d) => d.discipline);
      const disciplines: DisciplineGroup[] = disciplineNames.length
        ? disciplineNames.map((discipline) => ({
            discipline,
            elementTypes: view.summary.element_type_index,
            occurrenceTotal:
              view.summary.discipline_counts.find((d) => d.discipline === discipline)?.occurrence_count ?? 0,
          }))
        : [
            {
              discipline: 'Tanpa disiplin tercatat',
              elementTypes: view.summary.element_type_index,
              occurrenceTotal: view.summary.element_type_index.reduce((sum, e) => sum + e.occurrence_count, 0),
            },
          ];

      return {
        levelId: view.grain.level_id ?? view.snapshot_id,
        levelName: view.summary.level_name,
        disciplines,
        totalOccurrences: view.summary.element_type_index.reduce((sum, e) => sum + e.occurrence_count, 0),
        confirmedCount: view.quality.confirmed_count,
        ambiguousBindingCount: view.quality.ambiguous_binding_count,
        conflictCount: view.quality.conflict_count,
      };
    })
    .sort((a, b) => a.levelName.localeCompare(b.levelName, 'id-ID'));
}

/** Bentuk longgar untuk node/evidence hasil retrieve (lihat main.py:615-621 — wire format
 * apa adanya, bukan skema PCKM penuh). Field opsional dijaga defensif di komponen. */
export interface RetrievedNode {
  node_id?: string;
  type?: string;
  name?: string;
  discipline?: string;
  confidence?: number;
}

export interface RetrievedEvidence {
  evidence_id?: string;
  document_id?: string;
  sheet_id?: string;
  page_index?: number;
  raw_text?: string;
}
