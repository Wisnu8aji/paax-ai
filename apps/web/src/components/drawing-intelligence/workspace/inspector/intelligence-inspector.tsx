'use client';

/** Intelligence Inspector kanan, 5 tab (blueprint §15, gambar referensi 1/8). */

import { useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Flag,
  Info,
  PanelRightClose,
  PanelRightOpen,
  X,
} from 'lucide-react';
import {
  useWorkspace,
  useActiveSheet,
  useSelectedElement,
  categoryCountsForSheet,
  type InspectorTab,
} from '../workspace-store';
import {
  DISCIPLINE_LABELS,
  ELEMENT_CATEGORY_LABELS,
  type ElementCategory,
  type ElementProperty,
  type VerificationStatus,
} from '../di-types';

const CATEGORY_DOT: Record<string, string> = {
  column: 'var(--di-ov-column)',
  beam: 'var(--di-ov-beam)',
  slab: 'var(--di-ov-slab)',
  'shear-wall': 'var(--di-ov-shear)',
  wall: 'var(--di-ov-wall)',
  room: 'var(--di-ov-room-office)',
  door: 'var(--di-ov-wall)',
  window: 'var(--di-ov-slab)',
};

const VERIFICATION_PILL: Record<VerificationStatus, { tone: string; label: string }> = {
  detected: { tone: 'info', label: 'Detected' },
  verified: { tone: 'ok', label: 'Verified' },
  'needs-review': { tone: 'warn', label: 'Needs review' },
  rejected: { tone: 'err', label: 'Rejected' },
  unsupported: { tone: 'err', label: 'Unsupported' },
  'missing-source': { tone: 'warn', label: 'Missing source' },
};

const STRUCTURAL_CATEGORIES: ElementCategory[] = ['column', 'beam', 'slab', 'shear-wall', 'stair'];
const ANNOTATION_CATEGORIES: ElementCategory[] = ['grid-axis', 'dimension', 'room'];

const TAB_ORDER: { id: InspectorTab; label: string }[] = [
  { id: 'sheet', label: 'Sheet' },
  { id: 'detection', label: 'Detection' },
  { id: 'properties', label: 'Properties' },
  { id: 'verification', label: 'Verification' },
  { id: 'ai-notes', label: 'AI Notes' },
];

function ConfidenceRing({ value, size = 64 }: { value: number; size?: number }) {
  const stroke = size >= 60 ? 6 : 4;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (value / 100) * c;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--di-panel2)" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--di-ok)"
        strokeWidth={stroke}
        strokeDasharray={c}
        strokeDashoffset={offset}
        strokeLinecap="round"
      />
      <text
        x="50%"
        y="50%"
        textAnchor="middle"
        dominantBaseline="central"
        transform={`rotate(90 ${size / 2} ${size / 2})`}
        className="di-mono"
        style={{ fontSize: size >= 60 ? 14 : 11, fontWeight: 700, fill: 'var(--di-text)' }}
      >
        {value}%
      </text>
    </svg>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div className="di-section-title" style={{ marginBottom: 2 }}>{children}</div>;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12 }}>
      <span style={{ color: 'var(--di-text3)' }}>{label}</span>
      <span style={{ color: 'var(--di-text)', textAlign: 'right' }}>{value}</span>
    </div>
  );
}

function Section({ children, last }: { children: React.ReactNode; last?: boolean }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        paddingBottom: 14,
        borderBottom: last ? 'none' : '1px solid var(--di-border)',
      }}
    >
      {children}
    </div>
  );
}

function OriginValue({ prop }: { prop: ElementProperty }) {
  if (prop.origin === 'extracted') return <span>{prop.value}</span>;
  const chip: Record<string, { label: string; tone: string }> = {
    inferred: { label: 'inferred', tone: 'info' },
    'user-corrected': { label: 'corrected', tone: 'accent' },
    inherited: { label: 'inherited', tone: 'info' },
  };
  const c = chip[prop.origin];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontStyle: prop.origin === 'inferred' ? 'italic' : 'normal' }}>{prop.value}</span>
      {c && (
        <span className="di-pill" data-tone={c.tone} style={{ height: 16, fontSize: 9 }}>
          {c.label}
        </span>
      )}
    </span>
  );
}

export function IntelligenceInspector() {
  const { state, dispatch } = useWorkspace();
  const sheet = useActiveSheet();
  const el = useSelectedElement();
  const [showReclassify, setShowReclassify] = useState(false);

  const verifiedCount = useMemo(
    () => state.quantities.filter((q) => q.status === 'verified').length,
    [state.quantities],
  );
  const needsReviewCount = useMemo(
    () => state.quantities.filter((q) => q.status === 'needs-review').length,
    [state.quantities],
  );
  const issuesCount = useMemo(
    () => state.reviewQueue.filter((r) => r.severity === 'issue' && !r.resolved).length,
    [state.reviewQueue],
  );

  const categoryCounts = useMemo(
    () => (sheet ? categoryCountsForSheet(state.elements, sheet.id) : []),
    [state.elements, sheet],
  );

  const detectedSummary = useMemo(() => {
    if (state.summaryViews && state.summaryViews.length > 0) {
      const view = state.summaryViews[0];
      if (view && view.summary && view.summary.element_type_index) {
        return view.summary.element_type_index.slice(0, 8).map(idx => {
          let cat = 'column';
          const n = (idx.name || '').toLowerCase();
          if (n.includes('beam')) cat = 'beam';
          else if (n.includes('slab')) cat = 'slab';
          else if (n.includes('wall')) cat = 'wall';
          else if (n.includes('door')) cat = 'door';
          else if (n.includes('window')) cat = 'window';
          else if (n.includes('room')) cat = 'room';
          return { category: cat as ElementCategory, count: idx.occurrence_count, label: idx.name };
        });
      }
    }
    // Fallback to elements count
    const counts = new Map<ElementCategory, number>();
    for (const e of state.elements) {
      counts.set(e.category, (counts.get(e.category) ?? 0) + 1);
    }
    return Array.from(counts, ([category, count]) => ({ category, count, label: ELEMENT_CATEGORY_LABELS[category] }));
  }, [state.summaryViews, state.elements]);

  if (state.inspector.collapsed) {
    return (
      <aside
        className="di-panel"
        style={{
          width: 40,
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'center',
          paddingTop: 10,
          borderTop: 'none',
          borderBottom: 'none',
          borderRight: 'none',
        }}
      >
        <button
          className="di-icon-btn"
          title="Expand Intelligence Inspector"
          onClick={() => dispatch({ type: 'inspector', patch: { collapsed: false } })}
        >
          <PanelRightOpen size={16} />
        </button>
      </aside>
    );
  }

  const goToDock = (tab: 'detected' | 'review-queue') => {
    dispatch({ type: 'dock', patch: { tab, expanded: true } });
  };

  const header = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div className="di-section-title">Intelligence Inspector</div>
      <div style={{ display: 'flex', gap: 4 }}>
        <button
          className="di-icon-btn"
          title="Collapse"
          onClick={() => dispatch({ type: 'inspector', patch: { collapsed: true } })}
        >
          <PanelRightClose size={15} />
        </button>
        <button
          className="di-icon-btn"
          title="Close"
          onClick={() => dispatch({ type: 'inspector', patch: { collapsed: true } })}
        >
          <X size={15} />
        </button>
      </div>
    </div>
  );

  // ── Sheet view (tanpa elemen terpilih) ──────────────────────────────────
  function renderSheetSummary() {
    if (!sheet) {
      return (
        <div style={{ fontSize: 12, color: 'var(--di-text3)' }}>No sheet selected.</div>
      );
    }
    return (
      <>
        <Section>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <SectionTitle>Sheet Summary</SectionTitle>
            <span className="di-pill" data-tone="ok">Analyzed</span>
          </div>
          <div style={{ fontFamily: 'var(--di-font-display)', fontSize: 14, color: 'var(--di-text)' }}>
            {sheet.code} – {sheet.title}
          </div>
          <Row label="Discipline" value={sheet.disciplines.map((d) => DISCIPLINE_LABELS[d]).join(' / ')} />
          <Row label="Scale" value={sheet.scale ?? '—'} />
          <Row label="Sheet Size" value={sheet.sheetSize} />
          <Row label="Revision" value={sheet.revision ?? '—'} />
          <Row label="Analyzed On" value={sheet.analyzedOn ?? '—'} />
        </Section>

        <Section>
          <SectionTitle>AI Confidence</SectionTitle>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <ConfidenceRing value={sheet.aiConfidence ?? 0} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--di-ok)' }}>High Confidence</span>
              <span
                style={{ fontSize: 10.5, color: 'var(--di-text3)', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                title="Model klasifikasi & ekstraksi internal — lihat AI Notes untuk detail actionable."
              >
                AI model: PAAX-Struct v2.3 <Info size={11} />
              </span>
            </div>
          </div>
        </Section>

        <Section>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <SectionTitle>Detected Elements</SectionTitle>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
            {detectedSummary.map((d, i) => (
              <div key={d.category + i} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <span
                  style={{
                    width: 9,
                    height: 9,
                    borderRadius: 2,
                    background: CATEGORY_DOT[d.category] ?? 'var(--di-text3)',
                    display: 'inline-block',
                  }}
                />
                <span className="di-mono" style={{ fontSize: 14, fontWeight: 700, color: 'var(--di-text)' }}>
                  {d.count}
                </span>
                <span style={{ fontSize: 10, color: 'var(--di-text3)' }}>{d.label}</span>
              </div>
            ))}
          </div>
          <button
            className="di-btn-ghost"
            style={{ alignSelf: 'flex-end', border: 'none', background: 'none', padding: 0, color: 'var(--di-action)', fontSize: 11, cursor: 'pointer' }}
            onClick={() => goToDock('detected')}
          >
            View all detections ›
          </button>
        </Section>

        <Section>
          <SectionTitle>Verification Notes</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
              <CheckCircle2 size={16} color="var(--di-ok)" />
              <span className="di-mono" style={{ fontSize: 13, fontWeight: 700 }}>{verifiedCount}</span>
              <span style={{ fontSize: 10, color: 'var(--di-text3)' }}>Verified</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
              <AlertCircle size={16} color="var(--di-warn)" />
              <span className="di-mono" style={{ fontSize: 13, fontWeight: 700 }}>{needsReviewCount}</span>
              <span style={{ fontSize: 10, color: 'var(--di-text3)' }}>Needs review</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
              <Flag size={16} color="var(--di-err)" />
              <span className="di-mono" style={{ fontSize: 13, fontWeight: 700 }}>{issuesCount}</span>
              <span style={{ fontSize: 10, color: 'var(--di-text3)' }}>Issues</span>
            </div>
          </div>
          <button
            className="di-btn-ghost"
            style={{ alignSelf: 'flex-end', border: 'none', background: 'none', padding: 0, color: 'var(--di-action)', fontSize: 11, cursor: 'pointer' }}
            onClick={() => goToDock('review-queue')}
          >
            View all notes ›
          </button>
        </Section>

        <Section last>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <SectionTitle>Ask PAAX</SectionTitle>
            <span className="di-pill" data-tone="accent">BETA</span>
          </div>
          <AskInline />
        </Section>
      </>
    );
  }

  function AskInline() {
    const { dispatch: d2, askPaax } = useWorkspace();
    const [q, setQ] = useState('');
    return (
      <form
        style={{ display: 'flex', gap: 6 }}
        onSubmit={(e) => {
          e.preventDefault();
          const text = q.trim();
          if (!text) return;
          d2({ type: 'ask-paax', patch: { open: true } });
          askPaax(text);
          setQ('');
        }}
      >
        <input
          className="di-input"
          style={{ flex: 1 }}
          placeholder="Ask a question about this sheet…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button type="submit" className="di-btn di-btn-primary" style={{ width: 32, padding: 0, justifyContent: 'center' }}>
          ›
        </button>
      </form>
    );
  }

  // ── Element view (dengan elemen terpilih) ───────────────────────────────
  function renderElementHeader() {
    if (!el) return null;
    const dims = el.dimensions ? ` (${el.dimensions})` : '';
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingBottom: 10, borderBottom: '1px solid var(--di-border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontFamily: 'var(--di-font-display)', fontSize: 14, color: 'var(--di-text)' }}>
            {el.code}{dims}
          </span>
          <span className="di-pill" data-tone="info">Selected</span>
        </div>
        <span className="di-mono" style={{ fontSize: 10.5, color: 'var(--di-text3)' }}>
          {ELEMENT_CATEGORY_LABELS[el.category].replace(/s$/, '')} – Structural · AI ID: {el.aiId}
        </span>
        <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
          {TAB_ORDER.map((t) => (
            <button
              key={t.id}
              className="di-btn-ghost"
              data-active={state.inspector.tab === t.id}
              style={{
                border: 'none',
                background: state.inspector.tab === t.id ? 'var(--di-accent-soft)' : 'transparent',
                color: state.inspector.tab === t.id ? 'var(--di-accent)' : 'var(--di-text3)',
                fontSize: 10.5,
                padding: '4px 8px',
                borderRadius: 6,
                cursor: 'pointer',
              }}
              onClick={() => dispatch({ type: 'inspector', patch: { tab: t.id } })}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  function renderProperties() {
    if (!el) return null;
    return (
      <>
        <Section>
          <SectionTitle>Element Details</SectionTitle>
          {el.properties.map((p) => (
            <Row key={p.label} label={p.label} value={<OriginValue prop={p} />} />
          ))}
        </Section>
        <Section>
          <SectionTitle>Location</SectionTitle>
          <Row label="Center (X, Y)" value={<span className="di-mono">{`${el.bbox.x + Math.round(el.bbox.w / 2)}, ${el.bbox.y + Math.round(el.bbox.h / 2)} mm`}</span>} />
          <Row label="Elevation" value={<span className="di-mono">{el.properties.find((p) => p.label === 'Elevation')?.value ?? '—'}</span>} />
          <Row label="Rotation" value={<span className="di-mono">0°</span>} />
        </Section>
        <Section>
          <SectionTitle>Source pages</SectionTitle>
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto' }}>
            {el.sourcePages.slice(0, 3).map((sp, i) => (
              <div
                key={i}
                style={{
                  minWidth: 72,
                  height: 54,
                  borderRadius: 6,
                  border: `1px solid ${i === 0 ? 'var(--di-accent)' : 'var(--di-border)'}`,
                  background: 'var(--di-paper)',
                  display: 'flex',
                  alignItems: 'flex-end',
                  padding: 4,
                }}
              >
                <span className="di-mono" style={{ fontSize: 9, color: 'var(--di-text3)' }}>{sp.sheetCode}</span>
              </div>
            ))}
          </div>
          <button
            className="di-btn-ghost"
            style={{ alignSelf: 'flex-start', border: 'none', background: 'none', padding: 0, color: 'var(--di-action)', fontSize: 11, cursor: 'pointer' }}
          >
            View all source pages ({el.sourcePages.length})
          </button>
        </Section>
        <Section last>
          <SectionTitle>Confidence</SectionTitle>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <ConfidenceRing value={el.confidence} size={44} />
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--di-ok)' }}>High Confidence</span>
          </div>
        </Section>
      </>
    );
  }

  function renderDetection() {
    if (!sheet) return null;
    const byCat = new Map(categoryCounts.map((c) => [c.category, c.count]));
    const renderGroup = (title: string, cats: ElementCategory[]) => (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--di-text2)' }}>{title}</span>
        {cats.filter((c) => byCat.has(c)).map((c) => (
          <button
            key={c}
            className="di-btn-ghost"
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              border: 'none',
              background: 'transparent',
              padding: '4px 2px',
              cursor: 'pointer',
              width: '100%',
            }}
            onClick={() => {
              const first = state.elements.find((e) => e.sheetId === sheet.id && e.category === c);
              if (first) dispatch({ type: 'select-element', elementId: first.id });
            }}
          >
            <span style={{ fontSize: 12, color: 'var(--di-text2)' }}>{ELEMENT_CATEGORY_LABELS[c]}</span>
            <span className="di-mono" style={{ fontSize: 12, color: 'var(--di-text)' }}>{byCat.get(c)}</span>
          </button>
        ))}
      </div>
    );
    return (
      <Section last>
        {renderGroup('Structural elements', STRUCTURAL_CATEGORIES)}
        {renderGroup('Annotations', ANNOTATION_CATEGORIES)}
      </Section>
    );
  }

  function renderVerification() {
    if (!el) return null;
    const pill = VERIFICATION_PILL[el.verification];
    const setStatus = (status: VerificationStatus, note?: string) =>
      dispatch({ type: 'set-element-verification', elementId: el.id, status, note });
    return (
      <>
        <Section>
          <SectionTitle>Status</SectionTitle>
          <span className="di-pill" data-tone={pill.tone} style={{ alignSelf: 'flex-start', height: 24, fontSize: 12, padding: '0 10px' }}>
            {pill.label}
          </span>
        </Section>
        <Section>
          <SectionTitle>Source evidence</SectionTitle>
          {el.sourcePages.map((sp, i) => (
            <div key={i} style={{ fontSize: 11.5, color: 'var(--di-text2)' }}>
              <span className="di-mono">{sp.sheetCode}</span> — {sp.label}
            </div>
          ))}
        </Section>
        {el.aiNotes.length > 0 && (
          <Section>
            <SectionTitle>Conflicts</SectionTitle>
            {el.aiNotes.map((n, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  gap: 6,
                  padding: 8,
                  borderRadius: 8,
                  background: 'var(--di-warn-bg)',
                  border: '1px solid var(--di-warn-bd)',
                  fontSize: 11.5,
                  color: 'var(--di-text2)',
                }}
              >
                <AlertTriangle size={14} color="var(--di-warn)" style={{ flexShrink: 0, marginTop: 1 }} />
                <span>{n}</span>
              </div>
            ))}
          </Section>
        )}
        <Section last>
          <SectionTitle>Actions</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <button className="di-btn di-btn-ok" onClick={() => setStatus('verified')}>Verify</button>
            <button className="di-btn" onClick={() => setStatus('verified', 'Verified with correction')}>Verify with correction</button>
            <button className="di-btn" onClick={() => setStatus('needs-review')}>Mark needs review</button>
            <button className="di-btn" style={{ color: 'var(--di-err)', borderColor: 'var(--di-err-bd)' }} onClick={() => setStatus('rejected')}>
              Reject detection
            </button>
          </div>
        </Section>
      </>
    );
  }

  function renderAiNotes() {
    if (!el) return null;
    if (el.aiNotes.length === 0) {
      return (
        <Section last>
          <SectionTitle>AI Notes</SectionTitle>
          <span style={{ fontSize: 12, color: 'var(--di-text3)' }}>No actionable notes for this element.</span>
        </Section>
      );
    }
    return (
      <Section last>
        <SectionTitle>AI Notes</SectionTitle>
        {el.aiNotes.map((n, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              gap: 6,
              padding: 8,
              borderRadius: 8,
              background: 'var(--di-warn-bg)',
              border: '1px solid var(--di-warn-bd)',
              fontSize: 11.5,
              color: 'var(--di-text2)',
            }}
          >
            <AlertTriangle size={14} color="var(--di-warn)" style={{ flexShrink: 0, marginTop: 1 }} />
            <span>{n}</span>
          </div>
        ))}
      </Section>
    );
  }

  function renderElementFooter() {
    if (!el) return null;
    const setStatus = (status: VerificationStatus, note?: string) => {
      dispatch({ type: 'set-element-verification', elementId: el.id, status, note });
      if (status === 'verified' && !note) {
        dispatch({ type: 'push-activity', entry: { time: 'Now', message: `${el.code} verified`, kind: 'verify' } });
      }
    };
    return (
      <div
        style={{
          position: 'sticky',
          bottom: -14,
          marginTop: 'auto',
          marginLeft: -14,
          marginRight: -14,
          marginBottom: -14,
          padding: 14,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          background: 'var(--di-panel)',
          borderTop: '1px solid var(--di-border)',
        }}
      >
        <button className="di-btn di-btn-ok" onClick={() => setStatus('verified')}>
          <CheckCircle2 size={15} /> Verify element
        </button>
        <div style={{ position: 'relative' }}>
          <button className="di-btn" style={{ width: '100%', justifyContent: 'space-between' }} onClick={() => setShowReclassify((v) => !v)}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>Edit classification</span>
            <ChevronDown size={14} />
          </button>
          {showReclassify && (
            <div
              className="di-panel di-rise"
              style={{
                position: 'absolute',
                bottom: '110%',
                left: 0,
                right: 0,
                borderRadius: 8,
                padding: 6,
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
                zIndex: 5,
              }}
            >
              {(['column', 'beam', 'slab', 'shear-wall', 'wall', 'stair'] as ElementCategory[]).map((c) => (
                <button
                  key={c}
                  className="di-btn-ghost"
                  style={{ border: 'none', justifyContent: 'flex-start', fontSize: 12 }}
                  onClick={() => {
                    setStatus('verified', 'Reclassified');
                    setShowReclassify(false);
                  }}
                >
                  {ELEMENT_CATEGORY_LABELS[c]}
                </button>
              ))}
            </div>
          )}
        </div>
        <button className="di-btn" style={{ color: 'var(--di-err)', borderColor: 'var(--di-err-bd)' }} onClick={() => setStatus('needs-review')}>
          <Flag size={15} /> Mark issue
        </button>
      </div>
    );
  }

  const isElementMode = !!el;

  return (
    <aside
      className="di-panel"
      style={{
        width: 'var(--di-inspector-w)',
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        borderTop: 'none',
        borderBottom: 'none',
        borderRight: 'none',
        overflow: 'auto',
        padding: 14,
        gap: 12,
        position: 'relative',
      }}
    >
      {header}

      {!isElementMode && renderSheetSummary()}

      {isElementMode && (
        <>
          {renderElementHeader()}
          {state.inspector.tab === 'properties' && renderProperties()}
          {state.inspector.tab === 'detection' && renderDetection()}
          {state.inspector.tab === 'verification' && renderVerification()}
          {state.inspector.tab === 'ai-notes' && renderAiNotes()}
          {state.inspector.tab === 'sheet' && (
            <>
              {renderSheetSummary()}
              <button
                className="di-btn di-btn-ghost"
                style={{ alignSelf: 'flex-start' }}
                onClick={() => dispatch({ type: 'select-element', elementId: null })}
              >
                Back to sheet view
              </button>
            </>
          )}
          {(state.inspector.tab === 'properties') && renderElementFooter()}
        </>
      )}
    </aside>
  );
}
