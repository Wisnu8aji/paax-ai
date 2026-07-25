'use client';

/**
 * DrawingIntelligenceWorkspaceV2 — workspace teknik full-height multi-panel
 * (blueprint §4–5). Enam mode dalam SATU workspace persisten:
 * Files · Sheets · Analyze · Review · Quantities · Handoff.
 */

import './di-tokens.css';
import { WorkspaceProvider, useWorkspace } from './workspace-store';
import { useBackendSync } from './use-backend-sync';
import { WorkspaceTopbar } from './topbar';
import { ModeTabs } from './mode-tabs';
import { TechnicalStatusBar } from './status-bar';
import { FileSheetNavigator } from './navigator/file-sheet-navigator';
import { SheetGallery } from './navigator/sheet-gallery';
import { FilesMode } from './navigator/files-mode';
import { UploadDrawingModal } from './navigator/upload-modal';
import { DrawingCanvas } from './canvas/drawing-canvas';
import { IntelligenceInspector } from './inspector/intelligence-inspector';
import { AnalysisSetupPanel } from './inspector/analysis-setup-panel';
import { ProcessingOverlay } from './inspector/processing-overlay';
import { AskPaaxPanel } from './inspector/ask-paax';
import { QuantityDock } from './dock/quantity-dock';
import { QuantitiesMode } from './dock/quantities-mode';
import { HandoffMode } from './dock/handoff-mode';

export interface DrawingIntelligenceWorkspaceV2Props {
  projectName: string;
  /** id proyek nyata — bila ada, review queue disinkronkan dari backend */
  projectId?: string | null;
  /** data demo hanya untuk story/test eksplisit; runtime proyek selalu mulai dari data backend */
  withMockData?: boolean;
}

function WorkspaceBody({ projectId }: { projectId: string | null }) {
  const { state } = useWorkspace();
  const mode = state.mode;
  useBackendSync(projectId);

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', position: 'relative' }}>
      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        <FileSheetNavigator />

        {/* Area tengah per mode */}
        {mode === 'files' && <FilesMode />}
        {mode === 'sheets' && <SheetGallery />}
        {(mode === 'review' || mode === 'analyze') && (
          <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
              <DrawingCanvas />
              {mode === 'analyze' ? <AnalysisSetupPanel /> : <IntelligenceInspector />}
            </div>
            <QuantityDock />
          </div>
        )}
        {mode === 'quantities' && <QuantitiesMode />}
        {mode === 'handoff' && (
          <>
            <HandoffMode />
            <IntelligenceInspector />
          </>
        )}
        {(mode === 'files' || mode === 'sheets') && <IntelligenceInspector />}
      </div>

      {/* Overlay global */}
      <ProcessingOverlay />
      <UploadDrawingModal />
      <AskPaaxPanel />
    </div>
  );
}

export function DrawingIntelligenceWorkspaceV2({
  projectName,
  projectId = null,
  withMockData = false,
}: DrawingIntelligenceWorkspaceV2Props) {
  return (
    <WorkspaceProvider withMockData={withMockData} projectId={projectId}>
      <div
        className="di-workspace"
        style={{
          height: '100dvh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <WorkspaceTopbar projectName={projectName} />
        <ModeTabs />
        <WorkspaceBody projectId={projectId} />
        <TechnicalStatusBar />
      </div>
    </WorkspaceProvider>
  );
}
