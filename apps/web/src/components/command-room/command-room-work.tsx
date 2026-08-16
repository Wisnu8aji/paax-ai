"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  Activity,
  Archive,
  BookOpen,
  Check,
  CheckCircle2,
  CircleDot,
  FileText,
  ListChecks,
  Loader2,
  Plus,
  RotateCcw,
  Send,
  Settings2,
  ShieldAlert,
  Square,
  Terminal,
  Users,
  Wrench,
  X,
} from "lucide-react";
import { useWorkAgentStore } from "@/lib/command-room/use-work-agent";
import { workAgentStore } from "@/lib/command-room/work-agent-store";
import type { WorkEvent, WorkSessionSnapshot, WorkTask } from "@/lib/command-room/work-agent-types";
import { DEFAULT_WORK_SETTINGS, loadWorkSettings, saveWorkSettings, type WorkSettings } from "@/lib/command-room/work-settings";

export interface CommandRoomWorkSurfaceProps {
  initialSessionId?: string | null;
}

function taskStateLabel(state: WorkTask["state"]): string {
  if (state === "in_progress") return "berjalan";
  if (state === "completed") return "selesai";
  if (state === "failed") return "gagal";
  if (state === "cancelled") return "dibatalkan";
  return "menunggu";
}

function eventLabel(event: WorkEvent): string {
  if (event.type === "turn.started") return "Menjalankan permintaan";
  if (event.type === "assistant.interim") return event.message ?? "Komentar agent";
  if (event.type === "status.update") return event.statusLabel ?? "Agent bekerja";
  if (event.type === "tool.started") return `Menjalankan ${event.tool?.name ?? "tool"}`;
  if (event.type === "tool.completed") return event.tool?.summary ?? `${event.tool?.name ?? "Tool"} selesai`;
  if (event.type === "reasoning.delta") return "Thinking tersedia";
  if (event.type === "log.line") return event.log?.text ?? "Log diterima";
  if (event.type === "turn.completed") return "Jawaban selesai";
  if (event.type === "error") return event.errorMessage ?? "Proses gagal";
  return event.type;
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "--:--";
  }
}

function statusIcon(state: WorkTask["state"]) {
  if (state === "completed") return <CheckCircle2 size={14} />;
  if (state === "in_progress") return <Loader2 size={14} className="cr-work-spin" />;
  if (state === "failed") return <ShieldAlert size={14} />;
  return <CircleDot size={14} />;
}

function sessionStatus(session: WorkSessionSnapshot): string {
  if (session.state === "running") return "running";
  if (session.state === "waiting_approval") return "approval";
  if (session.state === "completed") return "complete";
  if (session.state === "failed") return "failed";
  if (session.state === "cancelled") return "stopped";
  return "ready";
}

export function CommandRoomWorkSurface({ initialSessionId = null }: CommandRoomWorkSurfaceProps) {
  const storeSnapshot = useWorkAgentStore();
  const [activeId, setActiveId] = useState<string | null>(initialSessionId);
  const [draft, setDraft] = useState("");
  const [settings, setSettings] = useState<WorkSettings>(DEFAULT_WORK_SETTINGS);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [approvalBusy, setApprovalBusy] = useState(false);
  const [approvalError, setApprovalError] = useState<string | null>(null);

  useEffect(() => {
    setSettings(loadWorkSettings());
    setSettingsLoaded(true);
  }, []);

  useEffect(() => {
    if (settingsLoaded) saveWorkSettings(settings);
  }, [settings, settingsLoaded]);

  useEffect(() => {
    if (initialSessionId) {
      if (!storeSnapshot.sessionsById[initialSessionId]) workAgentStore.createSession("New work", initialSessionId);
      setActiveId(initialSessionId);
      return;
    }
    if (activeId && storeSnapshot.sessionsById[activeId]) return;
    const first = storeSnapshot.sessionOrder[0];
    if (first) {
      setActiveId(first);
      return;
    }
    setActiveId(workAgentStore.createSession("New work"));
  }, [activeId, initialSessionId, storeSnapshot.sessionOrder, storeSnapshot.sessionsById]);

  const sessions = useMemo(
    () => storeSnapshot.sessionOrder.map((id) => storeSnapshot.sessionsById[id]).filter(Boolean),
    [storeSnapshot.sessionOrder, storeSnapshot.sessionsById],
  );
  const activeSession = activeId ? storeSnapshot.sessionsById[activeId] ?? null : null;
  const busy = activeSession?.state === "running" || activeSession?.state === "waiting_approval";

  function createSession() {
    if (busy) return;
    setActiveId(workAgentStore.createSession("New work"));
    setDraft("");
    setApprovalError(null);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!activeId || !draft.trim() || busy) return;
    const prompt = draft.trim();
    setDraft("");
    setApprovalError(null);
    void workAgentStore.startTurn(activeId, prompt);
  }

  async function resolveApproval(decision: "approved" | "denied") {
    if (!activeId || !activeSession?.pendingApproval || approvalBusy) return;
    setApprovalBusy(true);
    setApprovalError(null);
    try {
      const response = await fetch("/api/command-room/work/approval", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: activeId,
          approvalId: activeSession.pendingApproval.approvalId,
          decision,
        }),
      });
      if (!response.ok) throw new Error("Approval belum dapat diterapkan.");
    } catch (error) {
      setApprovalError(error instanceof Error ? error.message : "Approval gagal dikirim.");
    } finally {
      setApprovalBusy(false);
    }
  }

  return (
    <section className="cr-work-surface" data-testid="command-room-work-surface" aria-label="Work execution surface">
      <div className="cr-work-layout">
        <aside className="cr-work-session-rail" aria-label="Work sessions">
          <div className="cr-work-rail-head">
            <div>
              <span className="cr-work-eyebrow">Sessions</span>
              <strong>Work</strong>
            </div>
            <button type="button" className="cr-work-icon-button" aria-label="New work session" onClick={createSession} disabled={Boolean(busy)}>
              <Plus size={15} />
            </button>
          </div>
          <div className="cr-work-rail-caption">{sessions.length} session{sessions.length === 1 ? "" : "s"}</div>
          <div className="cr-work-session-list">
            {sessions.map((session) => {
              const disabled = Boolean(busy && session.sessionId !== activeId);
              return (
                <button
                  type="button"
                  key={session.sessionId}
                  className="cr-work-session-row"
                  data-active={session.sessionId === activeId ? "true" : undefined}
                  disabled={disabled}
                  onClick={() => setActiveId(session.sessionId)}
                  title={disabled ? "Selesaikan session aktif terlebih dahulu" : session.title}
                >
                  <span className={`cr-work-session-dot cr-work-session-dot-${sessionStatus(session)}`} />
                  <span className="cr-work-session-copy">
                    <span className="cr-work-session-title">{session.title}</span>
                    <span className="cr-work-session-meta">{sessionStatus(session)} · {formatTime(session.updatedAt)}</span>
                  </span>
                </button>
              );
            })}
          </div>
          <div className="cr-work-rail-foot">
            <div className="cr-work-rail-foot-item"><Archive size={14} /> Arsip lokal</div>
            <div className="cr-work-rail-foot-item"><RotateCcw size={14} /> Replay aktif</div>
          </div>
        </aside>

        <main className="cr-work-main">
          <header className="cr-work-header">
            <div className="cr-work-title-block">
              <div className="cr-work-title-line"><Activity size={16} /> <span>Agent workspace</span></div>
              <h1>Work workspace</h1>
              <p>{activeSession?.title ?? "New work"} <span aria-hidden="true">·</span> session-scoped event stream</p>
            </div>
            <div className="cr-work-header-actions">
              <span className="cr-work-live-chip"><span className="cr-work-live-dot" /> SSE · replay</span>
              <button type="button" className={`cr-work-mode-button ${settings.technical ? "is-active" : ""}`} onClick={() => setSettings((current) => ({ ...current, technical: !current.technical }))} aria-pressed={settings.technical}>
                {settings.technical ? "Product" : "Technical"}
              </button>
              {busy && (
                <button type="button" className="cr-work-stop-button" aria-label="Stop work" onClick={() => activeId && workAgentStore.cancelTurn(activeId)}>
                  <Square size={12} /> Stop
                </button>
              )}
            </div>
          </header>

          {activeSession ? (
            <div className="cr-work-content-grid">
              <div className="cr-work-center">
                <div className="cr-work-task-panel">
                  <div className="cr-work-panel-heading"><span><ListChecks size={15} /> Tasks</span><span>{activeSession.tasks.length || 0}</span></div>
                  {activeSession.tasks.length === 0 ? (
                    <div className="cr-work-empty-line">Task ledger akan muncul ketika agent mulai bekerja.</div>
                  ) : (
                    <div className="cr-work-task-list">
                      {activeSession.tasks.map((task) => (
                        <div className="cr-work-task-row" key={task.id} data-state={task.state}>
                          <span className="cr-work-task-icon">{statusIcon(task.state)}</span>
                          <span className="cr-work-task-title">{task.title}</span>
                          <span className="cr-work-task-state">{taskStateLabel(task.state)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="cr-work-feed" aria-label="Agent transcript">
                  {activeSession.state === "idle" && activeSession.events.length === 0 && (
                    <div className="cr-work-standby">
                      <div className="cr-work-standby-mark"><Terminal size={22} /></div>
                      <h2>Mulai tugas kerja</h2>
                      <p>Tulis instruksi lokal. Agent akan memperlihatkan task, komentar, tindakan, log, dan hasil secara berurutan.</p>
                    </div>
                  )}

                  {activeSession.commentary.map((comment, index) => (
                    <div className="cr-work-commentary" key={`${comment}-${index}`}><span className="cr-work-commentary-mark">·</span><span>{comment}</span></div>
                  ))}

                  {activeSession.events.filter((event) => event.type === "turn.started" || event.type === "status.update" || event.type === "tool.started" || event.type === "tool.completed" || event.type === "log.line").map((event) => (
                    <div className="cr-work-event-row" key={event.eventId}>
                      <span className="cr-work-event-type">{event.type}</span>
                      <span>{eventLabel(event)}</span>
                      <time>{formatTime(event.timestamp)}</time>
                    </div>
                  ))}

                  {activeSession.reasoning && (
                    <details className="cr-work-reasoning" open={busy}>
                      <summary><Wrench size={13} /> Thinking <span>{busy ? "active" : "available"}</span></summary>
                      <div className="cr-work-reasoning-body">{activeSession.reasoning}</div>
                    </details>
                  )}

                  {activeSession.tools.length > 0 && (
                    <section className="cr-work-trace-panel" aria-label="Tool trace">
                      <div className="cr-work-panel-heading"><span><Terminal size={15} /> Tool / command trace</span><span>{activeSession.tools.length}</span></div>
                      {activeSession.tools.map((tool) => (
                        <div className="cr-work-tool-card" key={tool.toolId}>
                          <div className="cr-work-tool-topline"><span className="cr-work-tool-state"><span className={`cr-work-tool-dot cr-work-tool-dot-${tool.state}`} />{tool.state}</span><strong>{tool.name}</strong><span>{tool.durationMs ? `${tool.durationMs} ms` : ""}</span></div>
                          {tool.summary && <div className="cr-work-tool-summary">{tool.summary}</div>}
                          {settings.technical && <pre className="cr-work-payload">{JSON.stringify({ args: tool.args, result: tool.result }, null, 2)}</pre>}
                        </div>
                      ))}
                    </section>
                  )}

                  {activeSession.artifacts.length > 0 && (
                    <section className="cr-work-artifact-panel" aria-label="Artifacts">
                      <div className="cr-work-panel-heading"><span><Archive size={15} /> Artifacts</span><span>{activeSession.artifacts.length}</span></div>
                      {activeSession.artifacts.map((artifact) => (
                        <div className="cr-work-artifact-card" key={artifact.artifactId}>
                          <strong>{artifact.name}</strong>
                          <span>{artifact.kind ?? "file"}{artifact.sizeBytes ? ` · ${artifact.sizeBytes} bytes` : ""}</span>
                          {artifact.summary && <small>{artifact.summary}</small>}
                        </div>
                      ))}
                    </section>
                  )}

                  {activeSession.logs.length > 0 && (
                    <section className="cr-work-log-panel" aria-label="Terminal logs">
                      <div className="cr-work-panel-heading"><span><FileText size={15} /> Log tail</span><span>{activeSession.logs.length}</span></div>
                      <div className="cr-work-log-lines">
                        {activeSession.logs.map((line, index) => <div className={`cr-work-log-line cr-work-log-${line.level}`} key={`${line.timestamp}-${index}`}><span>{formatTime(line.timestamp)}</span><code>{line.text}</code></div>)}
                      </div>
                    </section>
                  )}

                  {activeSession.answer && <div className="cr-work-answer"><div className="cr-work-answer-label">Final answer</div><div>{activeSession.answer}</div></div>}

                  {activeSession.errorMessage && <div className="cr-work-error" role="alert"><ShieldAlert size={15} /> {activeSession.errorMessage}</div>}

                  {activeSession.pendingApproval && (
                    <div className="cr-work-approval" role="alert">
                      <div className="cr-work-approval-icon"><ShieldAlert size={17} /></div>
                      <div className="cr-work-approval-copy"><strong>Approval required</strong><span>{activeSession.pendingApproval.reason}</span><code>{activeSession.pendingApproval.action}</code></div>
                      <div className="cr-work-approval-actions"><button type="button" onClick={() => void resolveApproval("denied")} disabled={approvalBusy}>Deny</button><button type="button" onClick={() => void resolveApproval("approved")} disabled={approvalBusy}>{approvalBusy ? "Sending…" : "Approve"}</button></div>
                    </div>
                  )}
                  {approvalError && <div className="cr-work-error" role="alert"><X size={15} /> {approvalError}</div>}

                  {settings.technical && activeSession.events.length > 0 && (
                    <details className="cr-work-raw-events">
                      <summary>Raw event ledger · {activeSession.events.length}</summary>
                      <pre className="cr-work-payload">{JSON.stringify(activeSession.events, null, 2)}</pre>
                    </details>
                  )}
                </div>

                <form className="cr-work-composer" onSubmit={submit}>
                  <textarea aria-label="Instruksi kerja" value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); submit(event); } }} placeholder="Instruksikan pekerjaan lokal…" disabled={Boolean(busy)} rows={2} />
                  <div className="cr-work-composer-foot"><span>Shift + Enter untuk baris baru</span><button type="submit" aria-label="Kirim instruksi" disabled={!draft.trim() || Boolean(busy)}><Send size={14} /></button></div>
                </form>
              </div>

              <aside className="cr-work-settings-rail" aria-label="Work settings">
                <div className="cr-work-settings-head"><Settings2 size={15} /> Workspace controls</div>
                <div className="cr-work-setting-group"><div className="cr-work-setting-label"><BookOpen size={13} /> Blueprint</div><span className="cr-work-setting-value">No blueprint selected</span></div>
                <div className="cr-work-setting-group"><div className="cr-work-setting-label"><BookOpen size={13} /> Pengetahuan</div><span className="cr-work-setting-value">Session context only</span></div>
                <div className="cr-work-setting-group"><div className="cr-work-setting-label"><Archive size={13} /> Arsip</div><span className="cr-work-setting-value">Local replay enabled</span></div>
                <div className="cr-work-setting-group"><div className="cr-work-setting-label"><Users size={13} /> Pasukan</div><span className="cr-work-setting-value">No worker adapter</span></div>
                <label className="cr-work-setting-group"><span className="cr-work-setting-label">Persona</span><select value={settings.persona} onChange={(event) => setSettings((current) => ({ ...current, persona: event.target.value }))}><option>General operator</option><option>Reviewer</option><option>Builder</option></select></label>
                <label className="cr-work-setting-group"><span className="cr-work-setting-label"><ShieldAlert size={13} /> Approval</span><select value={settings.approvalMode} onChange={(event) => setSettings((current) => ({ ...current, approvalMode: event.target.value as WorkSettings["approvalMode"] }))}><option value="smart">Smart approval</option><option value="always">Always ask</option></select></label>
                <div className="cr-work-extension-card"><div className="cr-work-setting-label"><Wrench size={13} /> Extensions</div><span>Catalog ready · no external server configured</span></div>
                <div className="cr-work-settings-note">Technical view membuka payload dan raw event. Nilai rahasia selalu disaring sebelum masuk ke layar.</div>
              </aside>
            </div>
          ) : (
            <div className="cr-work-empty-state"><Loader2 size={18} className="cr-work-spin" /> Menyiapkan session…</div>
          )}
        </main>
      </div>
    </section>
  );
}
