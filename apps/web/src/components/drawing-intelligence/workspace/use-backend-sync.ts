'use client';

/**
 * useBackendSync — sambungan aman ke backend nyata (services/db lewat proxy
 * /api/drawing-intelligence). Bila backend hidup dan punya data untuk proyek
 * aktif. Empty/not-ready states remain explicit; no production fixture is
 * substituted when the backend has no data.
 *
 * TIDAK menghitung apa pun — hanya memetakan payload ke view-model.
 */

import { useEffect, useRef } from 'react';
import {
  fetchQuantityReadiness,
  fetchCivilWorkItems,
  fetchReviewQueue,
  fetchProjectDemSheets,
  fetchProjectDemRuns,
  fetchSummaryViews,
  fetchPackageIntelligence,
  fetchActiveSheetContext,
} from '../drawing-intelligence-api';
import { projectRepository } from '@/lib/projects/project-repository';
import { useWorkspace, mapQuantityReadinessToItems, mapCivilWorkItemsToQuantityItems, mapGraphNodesToElements } from './workspace-store';
import type { ReviewQueueItem, Sheet, DrawingFile } from './di-types';
import { mapProjectDemSheet } from './sheet-mapping';
import { mapRawDemSheetToSheet } from './sheet-view-mapping';

const CATEGORY_LABELS: Record<string, string> = {
  conflict: 'Dimension conflict',
  missing_dimension: 'Missing dimension',
  ambiguous_level: 'Ambiguous level binding',
  possibly_same: 'Possible duplicate element',
  needs_review: 'Needs review',
};

function mapDemRunToDrawingFile(run: any): DrawingFile {
  let status: DrawingFile['status'] = 'processing';
  if (run.status === 'created') status = 'uploading';
  else if (run.status === 'dem_complete' || run.status === 'synthesis_complete') status = 'completed';
  else if (run.status === 'failed' || run.status === 'synthesis_failed') status = 'failed';
  else if (run.status === 'partially_failed') status = 'partially_failed';

  return {
    id: run.id,
    name: run.file_name,
    sizeBytes: 0, // unknown until backend exposes uploaded size
    kind: (run.file_name.split('.').pop()?.toUpperCase() as any) || 'PDF',
    status,
    sheetCount: run.total_pages,
    uploadedAt: run.created_at,
  };
}

export function useBackendSync(projectId: string | null) {
  const { state, dispatch } = useWorkspace();
  const hasInitializedModeRef = useRef(false);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    hasInitializedModeRef.current = false;
  }, [projectId]);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;

    // Reset mock data immediately for real projects to avoid showing incorrect details
    dispatch({ type: 'clear-project-data' });

    let timer: any;
    const sync = async () => {
      try {
        const [queue, readiness, civilWorkItems, sheetsData, runsData, summaryViewsData, session, head] = await Promise.all([
          fetchReviewQueue(projectId),
          fetchQuantityReadiness(projectId),
          fetchCivilWorkItems(projectId),
          fetchProjectDemSheets(projectId),
          fetchProjectDemRuns(projectId),
          fetchSummaryViews(projectId),
          projectRepository.getWorkspaceSession(projectId).catch(() => null),
          projectRepository.getWorkspaceHead().catch(() => null),
        ]);
        if (cancelled) return;

        const hasRealData = queue.items.length > 0 || readiness.items.length > 0 || (civilWorkItems?.items.length ?? 0) > 0 || sheetsData.length > 0 || runsData.length > 0 || summaryViewsData.length > 0;
        const isUploadingOrMapped = stateRef.current.upload.running || stateRef.current.mappedSheets.length > 0;
        if (!hasRealData) {
          if (!isUploadingOrMapped) {
            dispatch({ type: 'backend-sync-failed', error: 'not-ready' });
          }
          if (!cancelled) {
            timer = setTimeout(sync, 3000);
          }
          return;
        }

        dispatch({ type: 'backend-connected', connected: true });

        if (!hasInitializedModeRef.current) {
          hasInitializedModeRef.current = true;
          if (stateRef.current.mode === 'files') {
            if (head?.active_module && head.active_module !== 'files') {
              dispatch({ type: 'set-mode', mode: head.active_module as any });
            } else if (sheetsData.length > 0 || queue.items.length > 0) {
              dispatch({ type: 'set-mode', mode: 'review' });
            }
          }
        }

        const snapshotId = queue.snapshot_id || readiness.snapshot_id || null;
        if (snapshotId) {
          dispatch({ type: 'set-active-snapshot-id', snapshotId });
        }

        const hasPendingRuns = runsData.some((r: any) => ['created', 'processing', 'uploading', 'pages_queued', 'pages_extracting'].includes(r.status));

        const combinedSheetsData = [...sheetsData];

        const mappedSheets: Sheet[] = combinedSheetsData.map(mapRawDemSheetToSheet);
        if (mappedSheets.length > 0) {
          dispatch({ type: 'replace-sheets', sheets: mappedSheets });
        } else {
          dispatch({ type: 'replace-sheets', sheets: [] });
        }

        const placeholders: any[] = [];
        for (const run of runsData) {
          const runId = run.id;
          const hasSheets = sheetsData.some((s: any) => s.run_id === runId);
          if (!hasSheets && run.total_pages > 0) {
            for (let i = 0; i < run.total_pages; i++) {
              placeholders.push({
                id: `placeholder-${runId}-${i}`,
                runId: runId,
                pageIndex: i,
                number: null,
                title: null,
                discipline: null,
                level: null,
                scale: null,
                revision: null,
                confidence: null,
                widthPx: null,
                heightPx: null,
                status: run.status === 'created' ? 'uploading' : 'processing',
                imageUrl: null,
              });
            }
          }
        }

        const allMappedSheets = [...combinedSheetsData.map(mapProjectDemSheet), ...placeholders];
        dispatch({ type: 'replace-mapped-sheets', sheets: allMappedSheets });

        let initialSheetId = state.activeSheetId;
        if (session?.active_sheet_id && allMappedSheets.some((s: any) => s.id === session.active_sheet_id)) {
          initialSheetId = session.active_sheet_id;
        } else if (!initialSheetId || !allMappedSheets.some((s: any) => s.id === initialSheetId)) {
          initialSheetId = allMappedSheets[0]?.id || null;
        }

        if (initialSheetId) {
          dispatch({ type: 'set-active-sheet', sheetId: initialSheetId });
        }
        const mappedFiles = runsData.map(mapDemRunToDrawingFile);

        if (mappedFiles.length > 0) {
          dispatch({ type: 'replace-files', files: mappedFiles });
        }

        if (hasPendingRuns && !cancelled) {
          timer = setTimeout(sync, 5000);
        }

        // Load the persisted package-level intelligence for the newest run
        // that has passed synthesis. Failure/absence is an honest null state,
        // never a reason to fabricate package metrics in the frontend.
        const intelligenceRun = runsData.find((run: any) =>
          run.status === 'synthesis_complete' || run.status === 'completed'
        );
        if (intelligenceRun?.id) {
          const packageIntelligence = await fetchPackageIntelligence(intelligenceRun.id).catch(() => null);
          if (!cancelled) {
            dispatch({ type: 'analysis', patch: { packageIntelligence } });
          }
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
          // Never retrieve a whole project graph merely because the workspace
          // opened. It is large, unnecessary for sheet navigation, and graph
          // retrieval belongs to an explicit user question/tool invocation.
          const graphData: any = null;
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

        const civilQuantities = civilWorkItems?.items.length ? mapCivilWorkItemsToQuantityItems(civilWorkItems.items) : [];
        const readinessQuantities = readiness.items.length ? mapQuantityReadinessToItems(readiness.items) : [];
        // Combined quantity items prioritize verified Civil Work Items first, followed by all remaining candidate element types from quantity-readiness
        const combinedQuantities = [
          ...civilQuantities,
          ...readinessQuantities.filter((rq) => !civilQuantities.some((cq) => cq.itemCode === rq.itemCode || cq.id === rq.id))
        ];
        if (combinedQuantities.length > 0) {
          dispatch({ type: 'replace-quantities', quantities: combinedQuantities });
        }

        if (summaryViewsData && summaryViewsData.length > 0) {
          dispatch({ type: 'replace-summary-views', summaryViews: summaryViewsData });
        }

        const authoritativeSummary = civilWorkItems?.summary ?? readiness.summary;
        dispatch({
          type: 'set-status',
          message: `Terhubung ke proyek ${projectId} — ${authoritativeSummary.ready} item siap, ${authoritativeSummary.needs_review} perlu review`,
        });
      } catch (err) {
        if (cancelled) return;
        console.error('Failed to sync backend:', err);
        dispatch({ type: 'backend-sync-failed', error: 'failed' });
      }
    };
    sync();

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [projectId, state.files.length, state.upload.entries.length, state.upload.running, dispatch]);

  useEffect(() => {
    const selected = state.mappedSheets.find((sheet) => sheet.id === state.activeSheetId);
    if (!projectId || !selected) return;
    let cancelled = false;

    fetchActiveSheetContext(selected.runId, selected.pageIndex)
      .then((context) => {
        if (cancelled) return;
        const elements = context.physical_instances.map((instance: any) => {
          const bbox = instance.bbox || {};
          const category = String(instance.category || 'unknown') as any;
          return {
            id: String(instance.instance_id),
            sheetId: selected.id,
            code: String(instance.code || instance.instance_id),
            aiId: String(instance.instance_id),
            category,
            label: String(instance.code || instance.category || 'Detected item'),
            floorId: String(instance.level || selected.level || 'UNKNOWN'),
            grid: null,
            dimensions: null,
            material: null,
            bbox: {
              x: Number(bbox.x0 || 0) * 1000,
              y: Number(bbox.y0 || 0) * 1000,
              w: Math.max(0, Number(bbox.x1 || 0) - Number(bbox.x0 || 0)) * 1000,
              h: Math.max(0, Number(bbox.y1 || 0) - Number(bbox.y0 || 0)) * 1000,
            },
            confidence: typeof instance.confidence === 'number' ? Math.round(instance.confidence * 100) : null,
            verification: (instance.authority === 'human_confirmed' || instance.authority === 'engine_confirmed' ? 'verified' : 'detected') as 'verified' | 'detected',
            properties: [],
            sourcePages: [{ sheetCode: `p.${selected.pageIndex + 1}`, label: 'Active sheet evidence' }],
            aiNotes: [],
          };
        });
        dispatch({ type: 'replace-elements', elements });
      })
      .catch((error) => {
        if (!cancelled) {
          console.error('Failed to load active-sheet context:', error);
          dispatch({ type: 'replace-elements', elements: [] });
        }
      });

    return () => { cancelled = true; };
  }, [projectId, state.activeSheetId, state.mappedSheets, dispatch]);

  // Persist session to backend on change
  useEffect(() => {
    if (!projectId || !state.backendConnected) return;

    const sessionPatch = {
      active_sheet_id: state.activeSheetId?.startsWith('placeholder-') ? null : state.activeSheetId,
      selected_sheet_ids: state.selectedSheetIds.filter(id => !id.startsWith('placeholder-')),
      preferences: {
        zoom: state.canvas.zoom,
        panX: state.canvas.panX,
        panY: state.canvas.panY,
        dock_tab: state.dock.tab,
      }
    };

    const headPatch = {
      active_module: state.mode,
      active_project_id: projectId,
    };

    const timer = setTimeout(() => {
      projectRepository.patchWorkspaceSession(projectId, sessionPatch).catch(err => {
        console.error('Failed to sync workspace session:', err);
      });
      projectRepository.patchWorkspaceHead(headPatch).catch(err => {
        console.error('Failed to sync workspace head:', err);
      });
    }, 1000); // 1s debounce

    return () => clearTimeout(timer);
  }, [
    projectId,
    state.backendConnected,
    state.mode,
    state.activeSheetId,
    state.selectedSheetIds,
    state.canvas.zoom,
    state.canvas.panX,
    state.canvas.panY,
    state.dock.tab
  ]);
}
