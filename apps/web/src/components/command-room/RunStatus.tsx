'use client';

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertCircle,
  BrainCircuit,
  Check,
  ChevronDown,
  ChevronRight,
  CircleDot,
  Clock,
  Database,
  FileSearch,
  Loader2,
  Network,
  PenLine,
  Save,
  Search,
  ShieldCheck,
  StopCircle,
  Wrench,
} from "lucide-react";
import type { ActiveRun } from "@/lib/chat/chat-run-store";
import type { ActivityKind, ActivityStep } from "@/lib/chat/activity-timeline";
import type { StoredProcessingTrace } from "@/lib/chat/chat-history";
import { formatTimerDisplay } from "@/lib/chat/format-run-duration";

function StepIcon({ kind, active }: { kind: ActivityKind; active: boolean }) {
  const props = { size: 14, strokeWidth: 1.8 };
  if (active) return <Loader2 {...props} style={{ animation: 'paxspin 1.5s linear infinite' }} />;
  switch (kind) {
    case 'inspect': return <FileSearch {...props} />;
    case 'context': return <Database {...props} />;
    case 'search': return <Search {...props} />;
    case 'graph': return <Network {...props} />;
    case 'tool': return <Wrench {...props} />;
    case 'reason': return <BrainCircuit {...props} />;
    case 'verify': return <ShieldCheck {...props} />;
    case 'compose': return <PenLine {...props} />;
    case 'save': return <Save {...props} />;
    case 'warning': return <AlertCircle {...props} />;
    case 'complete': return <Check {...props} />;
    default: return <CircleDot {...props} />;
  }
}

function ActivityList({ steps, running }: { steps: ActivityStep[]; running: boolean }) {
  if (steps.length === 0) return null;
  return (
    <div
      role={running ? 'status' : undefined}
      aria-live={running ? 'polite' : undefined}
      aria-atomic={running ? false : undefined}
      aria-label={running ? 'Proses yang sedang dikerjakan' : 'Riwayat proses'}
      style={{ display: 'flex', flexDirection: 'column', gap: 9, padding: '4px 0 2px' }}
    >
      {steps.map((step, index) => {
        const active = step.state === 'active' && running;
        return (
          <div
            key={step.id}
            className="pax-fade"
            style={{
              position: 'relative',
              display: 'grid',
              gridTemplateColumns: '20px minmax(0,1fr)',
              gap: 8,
              alignItems: 'start',
              minHeight: 20,
            }}
          >
            {index < steps.length - 1 && (
              <span
                aria-hidden="true"
                style={{
                  position: 'absolute', left: 9.5, top: 18, bottom: -10,
                  width: 1, background: 'var(--cr-border, rgba(255,255,255,0.09))',
                }}
              />
            )}
            <span
              aria-hidden="true"
              style={{
                width: 20, height: 20, borderRadius: 6,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                color: active ? 'var(--cr-orange)' : step.state === 'failed' ? 'var(--cr-orange)' : 'var(--cr-text3)',
                background: active ? 'var(--cr-orange-soft)' : 'var(--cr-elev)',
                zIndex: 1,
              }}
            >
              <StepIcon kind={step.kind} active={active} />
            </span>
            <div style={{ minWidth: 0, paddingTop: 1 }}>
              <div style={{ fontSize: 12.5, lineHeight: 1.35, color: active ? 'var(--cr-text)' : 'var(--cr-text2)', fontWeight: active ? 600 : 500 }}>
                {step.label}
              </div>
              {step.detail && (
                <div style={{ marginTop: 2, fontSize: 10.8, lineHeight: 1.4, color: 'var(--cr-text3)' }}>
                  {step.detail}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ActivityDisclosure({ expanded, children }: { expanded: boolean; children: ReactNode }) {
  return (
    <div
      aria-hidden={!expanded}
      style={{
        display: 'grid',
        gridTemplateRows: expanded ? '1fr' : '0fr',
        opacity: expanded ? 1 : 0,
        transition: 'grid-template-rows 180ms ease, opacity 150ms ease',
      }}
    >
      <div style={{ overflow: 'hidden' }}>{children}</div>
    </div>
  );
}

export function ProcessingTrace({ trace, autoCollapse = false }: { trace: StoredProcessingTrace; autoCollapse?: boolean }) {
  const [expanded, setExpanded] = useState(autoCollapse);
  useEffect(() => {
    if (!autoCollapse) return;
    const timer = window.setTimeout(() => setExpanded(false), 420);
    return () => window.clearTimeout(timer);
  }, [autoCollapse]);
  return (
    <div style={{ margin: '2px 0 10px' }}>
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        aria-label={expanded ? 'Tutup rincian proses' : 'Buka rincian proses'}
        className="pax-cr-hover"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          border: 'none', background: 'transparent', padding: '3px 4px 3px 0',
          color: 'var(--cr-text3)', cursor: 'pointer', fontSize: 11.5,
        }}
      >
        {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        <Clock size={12} />
        <span>{trace.durationLabel}</span>
      </button>
      <ActivityDisclosure expanded={expanded}>
        <div className="pax-fade" style={{ marginTop: 7, paddingLeft: 2, maxWidth: 640 }}>
          <ActivityList steps={trace.steps as ActivityStep[]} running={false} />
        </div>
      </ActivityDisclosure>
    </div>
  );
}

export function RunStatus({ run, onStop }: { run: ActiveRun; onStop: () => void }) {
  const isRunning = run.state === 'queued' || run.state === 'running' || run.state === 'streaming';
  const [expanded, setExpanded] = useState(true);
  useEffect(() => {
    if (run.state === 'completed') setExpanded(false);
  }, [run.state]);

  const latest = useMemo(
    () => [...run.activitySteps].reverse().find((step) => step.state === 'active') ?? run.activitySteps[run.activitySteps.length - 1],
    [run.activitySteps],
  );

  if (run.state === 'completed') {
    return <ProcessingTrace autoCollapse trace={{ modelName: run.modelName, durationMs: run.elapsedMs, durationLabel: run.finalDurationLabel || 'Memproses selesai', steps: run.activitySteps }} />;
  }

  if (run.state === 'failed' || run.state === 'cancelled') {
    return (
      <div style={{ marginTop: 8 }}>
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="pax-cr-hover"
          style={{ display: 'flex', alignItems: 'center', gap: 6, border: 'none', background: 'transparent', padding: 0, color: run.state === 'failed' ? 'var(--cr-orange)' : 'var(--cr-text3)', cursor: 'pointer', fontSize: 11.5 }}
        >
          {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          {run.state === 'failed' ? <AlertCircle size={12} /> : <StopCircle size={12} />}
          {run.finalDurationLabel}
        </button>
        <ActivityDisclosure expanded={expanded}>
          <ActivityList steps={run.activitySteps} running={false} />
        </ActivityDisclosure>
        {run.errorMessage && <div style={{ marginTop: 7, fontSize: 11, color: 'var(--cr-orange)', background: 'rgba(217,119,87,0.1)', padding: '6px 10px', borderRadius: 6 }}>{run.errorMessage}</div>}
      </div>
    );
  }

  return (
    <div className="pax-fade" style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 8, maxWidth: 680 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          className="pax-cr-hover"
          style={{ display: 'flex', alignItems: 'center', gap: 7, border: 'none', background: 'transparent', padding: 0, color: 'var(--cr-text2)', cursor: 'pointer', minWidth: 0 }}
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <span style={{ display: 'inline-flex', color: 'var(--cr-orange)' }}><Loader2 size={14} style={{ animation: 'paxspin 1.5s linear infinite' }} /></span>
          <span style={{ fontSize: 12.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {latest?.label || run.statusLabel}
          </span>
          <span className="pax-mono" style={{ fontSize: 10.5, color: 'var(--cr-text3)', flexShrink: 0 }}>
            {formatTimerDisplay(run.elapsedMs)}
          </span>
        </button>
        <span style={{ flex: 1 }} />
        {isRunning && (
          <button
            onClick={onStop}
            className="pax-cr-hover"
            title="Hentikan proses"
            style={{ width: 26, height: 26, borderRadius: 7, border: 'none', background: 'var(--cr-elev)', color: 'var(--cr-text2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <StopCircle size={14} />
          </button>
        )}
      </div>
      <ActivityDisclosure expanded={expanded}>
        <ActivityList steps={run.activitySteps} running />
      </ActivityDisclosure>
      {run.modelName === 'Noir' && run.hasReasoningStarted && run.reasoningContent.trim() && expanded && (
        <div style={{ fontSize: 11.5, lineHeight: 1.5, color: 'var(--cr-text3)', background: 'var(--cr-elev)', border: '1px solid var(--cr-border, rgba(255,255,255,0.08))', borderRadius: 8, padding: '10px 12px', maxHeight: 260, overflowY: 'auto', whiteSpace: 'pre-wrap', fontFamily: 'var(--font-mono, monospace)' }}>
          {run.reasoningContent}
        </div>
      )}
    </div>
  );
}
