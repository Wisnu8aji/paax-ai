import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  Download,
  ExternalLink,
  Loader2,
  Paperclip,
  Square,
  Wrench,
  XCircle,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatArtifactRef, ChatSourceRef } from "@/lib/chat/command-room-chat-contract";
import type { OrderedMessagePart, ToolMessagePart } from "@/lib/chat/command-room-chat-reducer";

type ChatPartsRendererProps = {
  parts: OrderedMessagePart[];
  sources?: ChatSourceRef[];
  artifacts?: ChatArtifactRef[];
  compact?: boolean;
};

const TOOL_LABELS: Record<string, string> = {
  web_search: "Mencari sumber web",
  search_web: "Mencari sumber web",
  search: "Mencari sumber yang relevan",
  calculate: "Menghitung dengan kalkulator",
  calculate_expression: "Menghitung ekspresi",
  python: "Menjalankan analisis Python",
  vision_analyze: "Menganalisis gambar",
  file_read: "Membaca file yang dipilih",
  artifact_generate: "Menyiapkan file hasil",
  create_markdown_artifact: "Menyiapkan file Markdown",
  create_xlsx_artifact: "Menyiapkan file Excel",
};

function friendlyToolLabel(part: ToolMessagePart): string {
  return part.label || TOOL_LABELS[part.tool] || part.tool.replaceAll("_", " ");
}

function ToolStateIcon({ state }: Pick<ToolMessagePart, "state">) {
  if (state === "running" || state === "drafting") return <Loader2 size={14} className="animate-spin" />;
  if (state === "completed") return <CheckCircle2 size={14} />;
  if (state === "failed") return <XCircle size={14} />;
  if (state === "interrupted") return <Square size={12} />;
  return <CircleDashed size={14} />;
}

function toolColor(state: ToolMessagePart["state"]): string {
  if (state === "completed") return "var(--cr-green, #74c69d)";
  if (state === "failed") return "var(--cr-red, #ef8f8f)";
  if (state === "interrupted") return "var(--cr-orange)";
  return "var(--cr-text3)";
}

function ToolPart({ part }: { part: ToolMessagePart }) {
  const label = friendlyToolLabel(part);
  const detail = part.error || part.summary || part.message;
  return (
    <details className="cr-chat-tool-part" style={{ border: "1px solid var(--cr-border)", borderRadius: 10, background: "var(--cr-panel2)", overflow: "hidden" }}>
      <summary style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", cursor: "pointer", listStyle: "none", color: toolColor(part.state), fontSize: 12 }}>
        <Wrench size={13} />
        <span style={{ color: "var(--cr-text)", fontWeight: 650 }}>{label}</span>
        <span style={{ flex: 1 }} />
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: toolColor(part.state), fontSize: 11 }}>
          <ToolStateIcon state={part.state} />
          {part.state === "running" ? "berjalan" : part.state === "drafting" ? "disiapkan" : part.state === "completed" ? "selesai" : part.state === "failed" ? "gagal" : "dihentikan"}
        </span>
      </summary>
      {(detail || typeof part.progress === "number") && (
        <div style={{ padding: "0 10px 9px 31px", color: part.state === "failed" ? "var(--cr-red, #ef8f8f)" : "var(--cr-text3)", fontSize: 11, lineHeight: 1.45 }}>
          {typeof part.progress === "number" && <div style={{ marginBottom: 4 }}>Progress {Math.round(part.progress * 100)}%</div>}
          {detail}
          {part.resultRef && <div className="pax-mono" style={{ marginTop: 4, opacity: 0.8 }}>ref: {part.resultRef}</div>}
        </div>
      )}
    </details>
  );
}

function SourcePart({ sourceIds, sources }: { sourceIds: string[]; sources: ChatSourceRef[] }) {
  const visible = sourceIds.map((id) => sources.find((source) => source.source_id === id)).filter(Boolean) as ChatSourceRef[];
  if (!visible.length) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 2 }}>
      {visible.map((source) => (
        <a key={source.source_id} href={source.uri || undefined} target={source.uri ? "_blank" : undefined} rel="noreferrer" className="cr-chat-source-chip" style={{ display: "inline-flex", alignItems: "center", gap: 5, maxWidth: 260, padding: "5px 8px", borderRadius: 8, background: "var(--cr-panel2)", color: "var(--cr-text2)", textDecoration: "none", fontSize: 11 }}>
          <ExternalLink size={11} />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{source.title}</span>
        </a>
      ))}
    </div>
  );
}

function ArtifactPart({ artifactId, artifacts }: { artifactId: string; artifacts: ChatArtifactRef[] }) {
  const artifact = artifacts.find((item) => item.artifact_id === artifactId);
  if (!artifact) return null;
  const stateColor = artifact.status === "ready" ? "var(--cr-green, #74c69d)" : artifact.status === "failed" ? "var(--cr-red, #ef8f8f)" : "var(--cr-text3)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", border: "1px solid var(--cr-border)", borderRadius: 10, background: "var(--cr-panel2)", color: "var(--cr-text2)", fontSize: 12 }}>
      <Paperclip size={13} color={stateColor} />
      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{artifact.name}</span>
      <span style={{ color: stateColor, fontSize: 11 }}>{artifact.status === "ready" ? "siap" : artifact.status === "processing" || artifact.status === "created" ? "diproses" : "gagal"}</span>
      {artifact.status === "ready" && artifact.download_url && <a href={artifact.download_url} download aria-label={`Unduh ${artifact.name}`} title="Unduh" style={{ color: "var(--cr-text2)" }}><Download size={13} /></a>}
    </div>
  );
}

export function ChatPartsRenderer({ parts, sources = [], artifacts = [], compact = false }: ChatPartsRendererProps) {
  const ordered = [...parts].sort((a, b) => a.order - b.order);
  if (!ordered.length) return null;
  return (
    <div className="cr-chat-parts" style={{ display: "flex", flexDirection: "column", gap: compact ? 6 : 9 }}>
      {ordered.map((part) => {
        if (part.kind === "text") return <div key={part.partId} className="cr-markdown" style={{ fontSize: 15, lineHeight: 1.68, color: "var(--cr-text)" }}><ReactMarkdown remarkPlugins={[remarkGfm]}>{part.text}</ReactMarkdown></div>;
        if (part.kind === "interim") return <div key={part.partId} style={{ display: "flex", alignItems: "center", gap: 7, color: "var(--cr-text3)", fontSize: 11.5, lineHeight: 1.45 }}><CircleDashed size={12} /><span>{part.text}</span></div>;
        if (part.kind === "reasoning") return null;
        if (part.kind === "tool") return <ToolPart key={part.partId} part={part} />;
        if (part.kind === "source_group") return <SourcePart key={part.partId} sourceIds={part.sourceIds} sources={sources} />;
        if (part.kind === "artifact") return <ArtifactPart key={part.partId} artifactId={part.artifactId} artifacts={artifacts} />;
        if (part.kind === "attachment") return <div key={part.partId} style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--cr-text3)", fontSize: 11 }}><Paperclip size={12} />{part.name} · {part.status}</div>;
        if (part.kind === "error") return <div key={part.partId} style={{ display: "flex", alignItems: "center", gap: 7, color: "var(--cr-red, #ef8f8f)", fontSize: 12 }}><AlertTriangle size={13} />{part.text}</div>;
        return null;
      })}
    </div>
  );
}
