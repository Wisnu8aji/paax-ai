// paax/web — ArtifactCard (F2 #3, artifact).
//
// Adaptasi artifact-card.tsx konsol R1 ke v2. Artifact dari
// artifact.created event — payload by-reference (payload_ref string path).

export interface PaaxArtifactCardProps {
  artifactId: string
  kind: string
  payloadRef?: string | null
  summary?: Record<string, unknown> | null
  onOpen?: (payloadRef: string, kind: string) => void
}

export function PaaxArtifactCard({ artifactId, kind, payloadRef, summary, onOpen }: PaaxArtifactCardProps): React.ReactElement {
  return (
    <div data-testid="artifact-card" data-kind={kind} style={{ padding: '6px 8px', borderRadius: 7, border: '1px solid var(--di-border)', background: 'var(--di-panel)', display: 'flex', flexDirection: 'column', gap: 3 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--di-ok, #22c55e)' }}>{kind}</span>
        <span style={{ fontSize: 10, color: 'var(--di-text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{artifactId}</span>
      </div>
      {payloadRef && (
        <code style={{ fontSize: 9.5, color: 'var(--di-text2)', wordBreak: 'break-all' }}>{payloadRef}</code>
      )}
      {summary && Object.keys(summary).length > 0 && (
        <pre style={{ margin: 0, fontSize: 9.5, color: 'var(--di-text3)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 90, overflow: 'auto' }}>
          {JSON.stringify(summary, null, 2)}
        </pre>
      )}
      {onOpen && payloadRef && (
        <button
          type="button"
          onClick={() => onOpen(payloadRef, kind)}
          style={{ alignSelf: 'flex-start', fontSize: 10, padding: '2px 8px', borderRadius: 4, cursor: 'pointer' }}
        >
          open artifact
        </button>
      )}
    </div>
  )
}
