'use client';

/**
 * useBackendSync — sambungan aman ke backend nyata (services/db lewat proxy
 * /api/drawing-intelligence). Bila backend hidup dan punya data untuk proyek
 * aktif, review queue nyata menggantikan dummy; bila tidak, UI tetap penuh
 * berfungsi dengan mock (blueprint: dummy tidak boleh menghambat fungsi).
 *
 * TIDAK menghitung apa pun — hanya memetakan payload ke view-model.
 */

import { useEffect } from 'react';
import {
  fetchQuantityReadiness,
  fetchReviewQueue,
  fetchProjectDemSheets,
  fetchProjectDemRuns,
  retrieveProjectGraph,
  fetchSummaryViews,
} from '../drawing-intelligence-api';
import { useWorkspace, mapQuantityReadinessToItems, mapGraphNodesToElements } from './workspace-store';
import { makeGeometry } from './di-mock-data';
import type { ReviewQueueItem, Sheet, DrawingFile } from './di-types';

const CATEGORY_LABELS: Record<string, string> = {
  conflict: 'Dimension conflict',
  missing_dimension: 'Missing dimension',
  ambiguous_level: 'Ambiguous level binding',
  possibly_same: 'Possible duplicate element',
  needs_review: 'Needs review',
};

function getFloorInfo(code: string, title: string) {
  const combined = `${code} ${title}`.toLowerCase();
  if (combined.includes('ground') || combined.includes('floor 0') || combined.includes('floorplan 0') || combined.includes('a2-100')) {
    return { floorId: 'F00', floorLabel: 'Ground Floor' };
  } else if (combined.includes('first') || combined.includes('floor 1') || combined.includes('a2-101')) {
    return { floorId: 'F01', floorLabel: 'Floor 1' };
  } else if (combined.includes('second') || combined.includes('floor 2') || combined.includes('a2-102')) {
    return { floorId: 'F02', floorLabel: 'Floor 2' };
  } else if (combined.includes('third') || combined.includes('floor 3') || combined.includes('a2-103')) {
    return { floorId: 'F03', floorLabel: 'Floor 3' };
  } else if (combined.includes('fourth') || combined.includes('floor 4') || combined.includes('a2-104')) {
    return { floorId: 'F04', floorLabel: 'Floor 4' };
  } else if (combined.includes('roof') || combined.includes('a2-105')) {
    return { floorId: 'ROOF', floorLabel: 'Roof Plan' };
  }
  return { floorId: 'F02', floorLabel: 'Floor 2' };
}

function mapDemSheetToSheet(item: any): Sheet {
  const match = item.sheet_title ? item.sheet_title.match(/^([A-Za-z0-9\-]+)\s*[-–]\s*(.*)$/) : null;
  const code = match ? match[1].trim() : (item.sheet_title ? 'A2-' + (100 + item.page_index) : 'A2-' + (100 + item.page_index));
  const title = match ? match[2].trim() : (item.sheet_title || `Page ${item.page_index + 1}`);
  const floorInfo = getFloorInfo(code, title);
  const isRoof = title.toLowerCase().includes('roof');
  
  return {
    id: `${item.run_id}-page-${item.page_index}`,
    fileId: item.run_id,
    code,
    title,
    originalPageName: item.file_name,
    pageNumber: item.page_index + 1,
    floorId: floorInfo.floorId,
    floorLabel: floorInfo.floorLabel,
    disciplines: isRoof ? ['STR', 'ARC', 'MEP'] : ['STR', 'ARC', 'MEP', 'CIV'],
    drawingType: isRoof ? 'Roof Plan' : 'Floor Plan',
    scale: null,        // WP5: backend tidak mengembalikan scale — tampilkan null, jangan hardcode '1:100'
    scaleConfirmed: false,
    revision: null,     // WP5: backend tidak mengembalikan revision — tampilkan null, jangan hardcode 'R1'
    status: item.status === 'complete' ? 'analyzed' : 'queued',
    reviewIssueCount: 0,
    sheetSize: 'A1 (841 x 594 mm)',
    analyzedOn: '2026-07-17',
    aiConfidence: null, // WP5: confidence dihitung backend — tampilkan null saat belum tersedia
    geometry: makeGeometry(item.page_index, isRoof),
  };
}

function mapDemRunToDrawingFile(run: any): DrawingFile {
  let status: DrawingFile['status'] = 'processing';
  if (run.status === 'created') status = 'uploading';
  else if (run.status === 'dem_complete' || run.status === 'synthesis_complete') status = 'completed';
  else if (run.status === 'failed' || run.status === 'synthesis_failed') status = 'failed';
  else if (run.status === 'partially_failed') status = 'partially_failed';

  return {
    id: run.id,
    name: run.file_name,
    sizeBytes: 2.4 * 1024 * 1024, // fallback default size
    kind: (run.file_name.split('.').pop()?.toUpperCase() as any) || 'PDF',
    status,
    sheetCount: run.total_pages,
    uploadedAt: run.created_at,
  };
}

export function useBackendSync(projectId: string | null) {
  const { dispatch } = useWorkspace();

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;

    // Reset mock data immediately for real projects to avoid showing incorrect details
    dispatch({ type: 'clear-project-data' });

    (async () => {
      try {
        const [queue, readiness, sheetsData, runsData, summaryViewsData] = await Promise.all([
          fetchReviewQueue(projectId),
          fetchQuantityReadiness(projectId),
          fetchProjectDemSheets(projectId),
          fetchProjectDemRuns(projectId),
          fetchSummaryViews(projectId),
        ]);
        if (cancelled) return;

        const hasRealData = queue.items.length > 0 || readiness.items.length > 0 || sheetsData.length > 0 || runsData.length > 0 || summaryViewsData.length > 0;
        if (!hasRealData) {
          dispatch({ type: 'backend-sync-failed', error: 'not-ready' });
          return;
        }

        dispatch({ type: 'backend-connected', connected: true });

        const snapshotId = queue.snapshot_id || readiness.snapshot_id || null;
        if (snapshotId) {
          dispatch({ type: 'set-active-snapshot-id', snapshotId });
        }

        const mappedSheets = sheetsData.map(mapDemSheetToSheet);
        const mappedFiles = runsData.map(mapDemRunToDrawingFile);

        if (mappedSheets.length > 0) {
          dispatch({ type: 'replace-sheets', sheets: mappedSheets });
        }
        if (mappedFiles.length > 0) {
          dispatch({ type: 'replace-files', files: mappedFiles });
        }

        const findSheetIdForEvidence = (evidenceId: string | null): string | null => {
          if (!evidenceId) return null;
          const match = evidenceId.match(/page[-_]index[-_](\d+)|EV[-_](\d+)|page[-_](\d+)/i);
          if (match) {
            const pageIndexStr = match[1] || match[2] || match[3];
            const pageIndex = parseInt(pageIndexStr, 10);
            const found = mappedSheets.find(s => s.pageNumber - 1 === pageIndex);
            if (found) return found.id;
          }
          return null;
        };

        if (queue.items.length > 0) {
          const mapped: ReviewQueueItem[] = queue.items.map((item) => {
            let sheetId: string | null = null;
            // target_type is 'node' | 'edge' per schema — 'sheet' is not a valid value
            if (item.evidence_refs && item.evidence_refs.length > 0) {
              for (const ref of item.evidence_refs) {
                const sid = findSheetIdForEvidence(ref);
                if (sid) {
                  sheetId = sid;
                  break;
                }
              }
            }
            return {
              id: item.id,
              title: `${CATEGORY_LABELS[item.category] ?? item.category} — ${item.target_id}`,
              reason:
                item.reasons.map((r: any) => r.message).join('; ') ||
                item.reason_codes.join(', ') ||
                'Flagged by project graph integrity checks.',
              severity: item.category === 'conflict' ? 'issue' : 'review',
              sheetId,
              elementId: item.target_type === 'node' ? item.target_id : null,
              resolved: false,
            };
          });
          dispatch({ type: 'replace-review-queue', items: mapped });
        }

        // Map elements from project graph retrieval
        let allMappedElements: any[] = [];
        try {
          const graphData = await retrieveProjectGraph(projectId, ' ');
          if (graphData && graphData.nodes && graphData.nodes.length > 0) {
            const nodesList = graphData.nodes as any[];
            const edgesList = (graphData.edges || []) as any[];
            const sheetNodeToMappedSheet = new Map<string, Sheet>();
            const sheetNodes = nodesList.filter((n: any) => (n.type || n.node_type) === 'sheet');
            for (const sn of sheetNodes) {
              const matchedSheet = mappedSheets.find(
                (s) =>
                  s.code.toLowerCase() === (sn.name || '').toLowerCase() ||
                  s.originalPageName.includes(sn.name || '')
              );
              if (matchedSheet) {
                sheetNodeToMappedSheet.set(sn.node_id || sn.id, matchedSheet);
              }
            }

            const elementNodes = nodesList.filter(
              (n: any) =>
                (n.type || n.node_type) !== 'sheet' &&
                (n.type || n.node_type) !== 'discipline' &&
                (n.type || n.node_type) !== 'level'
            );
            const elementsBySheet = new Map<string, any[]>();

            if (edgesList.length > 0) {
              for (const edge of edgesList) {
                if (edge.relation === 'CONTAINS') {
                  const matchedSheet = sheetNodeToMappedSheet.get(edge.source);
                  if (matchedSheet) {
                    const node = elementNodes.find((n: any) => (n.node_id || n.id) === edge.target);
                    if (node) {
                      if (!elementsBySheet.has(matchedSheet.id)) {
                        elementsBySheet.set(matchedSheet.id, []);
                      }
                      elementsBySheet.get(matchedSheet.id)!.push(node);
                    }
                  }
                }
              }
            }

            for (const [sheetId, nodes] of elementsBySheet.entries()) {
              const mapped = mapGraphNodesToElements(nodes, sheetId);
              allMappedElements.push(...mapped);
            }
          }
        } catch (e) {
          console.error('Failed to load project graph elements:', e);
        }

        if (allMappedElements.length > 0) {
          dispatch({ type: 'replace-elements', elements: allMappedElements });
        }

        if (readiness.items.length > 0) {
          const mappedQuantities = mapQuantityReadinessToItems(readiness.items);
          dispatch({ type: 'replace-quantities', quantities: mappedQuantities });
        }

        if (summaryViewsData && summaryViewsData.length > 0) {
          dispatch({ type: 'replace-summary-views', summaryViews: summaryViewsData });
        }

        dispatch({
          type: 'set-status',
          message: `Connected to project graph — ${readiness.summary.ready} ready, ${readiness.summary.needs_review} need review`,
        });
      } catch (err) {
        if (cancelled) return;
        console.error('Failed to sync backend:', err);
        dispatch({ type: 'backend-sync-failed', error: 'failed' });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [projectId, dispatch]);
}
