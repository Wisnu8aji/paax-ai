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
  fetchDrawingPackageIndex,
} from '../drawing-intelligence-api';
import { projectRepository } from '@/lib/projects/project-repository';
import { useWorkspace, mapQuantityReadinessToItems, mapCivilWorkItemsToQuantityItems, mapGraphNodesToElements } from './workspace-store';
import type { ReviewQueueItem, Sheet, DrawingFile } from './di-types';
import { mapProjectDemSheet } from './sheet-mapping';
import { mapRawDemSheetToSheet } from './sheet-view-mapping';
import { validateAndMergeIndex } from './navigator/index-state';
import { INDEX_RETRY_DELAYS_MS, indexErrorStatus, indexFetchErrorMessage, shouldRetryIndexFetch } from './index-sync';

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
    // Monotonic cycle token: each sync() run starts exactly one index fetch
    // chain. A newer cycle invalidates the previous chain so retries never
    // double-fire per cycle (DoD 22 / acceptance "retry tidak dobel per siklus").
    let cycleId = 0;

    const syncIndexWithRetry = (runId: string, cycle: number, attempt: number) => {
      if (cancelled || cycle !== cycleId) return;
      fetchDrawingPackageIndex(runId)
        .then((rawIndex) => {
          if (cancelled || cycle !== cycleId) return;
          const currentState = stateRef.current;
          const mergeResult = validateAndMergeIndex({
            activeRunId: runId,
            prev: currentState.drawingPackageIndex,
            incoming: rawIndex,
          });
          if (mergeResult.error) {
            console.error('[INDEX SYNC ERROR] mergeResult:', mergeResult.error);
            dispatch({ type: 'set-drawing-package-index-error', error: mergeResult.error });
          } else if (mergeResult.index) {
            dispatch({ type: 'set-drawing-package-index', index: mergeResult.index, error: null });
          }
        })
        .catch((indexErr) => {
          if (cancelled || cycle !== cycleId) return;
          const status = indexErrorStatus(indexErr);
          const outcome = indexFetchErrorMessage(status, indexErr);
          console.error('[INDEX SYNC ERROR] fetch status:', status ?? 'network');
          if (shouldRetryIndexFetch(status) && attempt < INDEX_RETRY_DELAYS_MS.length) {
            // Exponential backoff 3s → 6s → 12s for transient failures only.
            timer = setTimeout(
              () => syncIndexWithRetry(runId, cycle, attempt + 1),
              INDEX_RETRY_DELAYS_MS[attempt]
            );
          } else {
            dispatch({ type: 'set-drawing-package-index-error', error: outcome.message });
          }
        });
    };

    const sync = async () => {
      try {
        cycleId += 1;
        const cycle = cycleId;
        const [queue, readiness, civilWorkItems, sheetsData, runsData, summaryViewsData, session, head] = await Promise.all([
          fetchReviewQueue(projectId).catch(() => ({ items: [], snapshot_id: null })),
          fetchQuantityReadiness(projectId).catch(() => ({ items: [], snapshot_id: null, summary: { total: 0, ready: 0, needs_review: 0 } })),
          fetchCivilWorkItems(projectId).catch(() => null),
          fetchProjectDemSheets(projectId).catch(() => []),
          fetchProjectDemRuns(projectId).catch(() => []),
          fetchSummaryViews(projectId).catch(() => []),
          projectRepository.getWorkspaceSession(projectId).catch(() => null),
          projectRepository.getWorkspaceHead().catch(() => null),
        ]);

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
          // Fetch package index immediately without waiting for package intelligence.
          // One single-flight chain per sync cycle; transient failures retry
          // with exponential backoff (3s → 6s → 12s) inside the same chain.
          syncIndexWithRetry(intelligenceRun.id, cycle, 0);

          // Fetch package intelligence asynchronously
          fetchPackageIntelligence(intelligenceRun.id)
            .then((packageIntelligence) => {
              if (!cancelled && packageIntelligence) {
                dispatch({ type: 'analysis', patch: { packageIntelligence } });
              }
            })
            .catch((err) => {
              console.warn('[INTEL SYNC WARN]', err);
            });
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
          const mapped: ReviewQueueItem[] = queue.items.map((item: any) => {
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
  }, [projectId]);

  useEffect(() => {
    const selected = state.mappedSheets.find((sheet) => sheet.id === state.activeSheetId);
    if (!projectId || !selected) return;
    let cancelled = false;

    fetchActiveSheetContext(projectId, selected.pageIndex)
      .then((context) => {
        if (cancelled) return;
        const nodes = context.nodes || [];
        const elements = mapGraphNodesToElements(nodes, selected.id);
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
