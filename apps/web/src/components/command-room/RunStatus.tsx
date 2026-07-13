import { Loader2, StopCircle, Clock, AlertCircle } from "lucide-react";
import type { ActiveRun } from "@/lib/chat/chat-run-store";
import { formatRunDuration, formatTimerDisplay } from "@/lib/chat/format-run-duration";

export function RunStatus({ run, onStop }: { run: ActiveRun, onStop: () => void }) {
  const isRunning = run.state === "queued" || run.state === "running" || run.state === "streaming";
  
  if (run.state === "completed") {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--cr-text3)', marginTop: 8 }}>
        <Clock size={12} />
        {run.finalDurationLabel}
      </div>
    );
  }

  if (run.state === "failed") {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--cr-orange)' }}>
          <AlertCircle size={12} />
          {run.finalDurationLabel || 'Failed.'}
        </div>
        <div style={{ fontSize: 11, color: 'var(--cr-orange)', background: 'rgba(217,119,87,0.1)', padding: '6px 10px', borderRadius: 6 }}>
          {run.errorMessage}
        </div>
      </div>
    );
  }

  if (run.state === "cancelled") {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--cr-text3)', marginTop: 8 }}>
        <StopCircle size={12} />
        {run.finalDurationLabel || 'Stopped.'}
      </div>
    );
  }

  // Noir menampilkan reasoning mentah apa adanya (bukan diringkas jadi status
  // label seperti Lucent/Arete -- lihat getReasoningContextStatus di
  // chat-run-store.ts). Panel ini tampil selama Noir sedang bernalar, berisi
  // seluruh reasoningContent yang sudah masuk sejauh ini, verbatim.
  const showRawReasoning = run.modelName === "Noir" && run.hasReasoningStarted && run.reasoningContent.trim().length > 0;

  return (
    <div className="pax-fade" style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span
          aria-hidden="true"
          style={{
            display: 'inline-flex',
            color: 'var(--cr-orange)',
            animation: 'paxspin 2.6s linear infinite',
            fontSize: 18,
            lineHeight: 1,
          }}
        >
          ✳
        </span>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: 12.5, color: 'var(--cr-text2)', fontWeight: 600 }}>{run.statusLabel}</span>
          <span className="pax-mono" style={{ fontSize: 10.5, color: 'var(--cr-text3)' }}>
            {formatTimerDisplay(run.elapsedMs)}
          </span>
        </div>
        <div style={{ flex: 1 }} />
        {isRunning && (
          <button
            onClick={onStop}
            className="pax-cr-hover"
            title="Stop generating"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 26,
              height: 26,
              borderRadius: 7,
              border: 'none',
              background: 'var(--cr-elev)',
              color: 'var(--cr-text2)',
              cursor: 'pointer'
            }}
          >
            <StopCircle size={14} />
          </button>
        )}
      </div>
      {showRawReasoning && (
        <div
          style={{
            fontSize: 11.5,
            lineHeight: 1.5,
            color: 'var(--cr-text3)',
            background: 'var(--cr-elev)',
            border: '1px solid var(--cr-border, rgba(255,255,255,0.08))',
            borderRadius: 8,
            padding: '10px 12px',
            maxHeight: 260,
            overflowY: 'auto',
            whiteSpace: 'pre-wrap',
            fontFamily: 'var(--font-mono, monospace)',
          }}
        >
          {run.reasoningContent}
        </div>
      )}
    </div>
  );
}
