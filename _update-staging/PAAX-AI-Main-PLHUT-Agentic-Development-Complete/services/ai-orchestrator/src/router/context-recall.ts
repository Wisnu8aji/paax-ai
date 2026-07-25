/**
 * Context Recall (primitif) — Fase 5, PLAN.md §9 Fase 5
 * (skill command-room-intelligence PLAN.md).
 *
 * Blueprint §6.3 mengasumsikan Context Recall menjalankan Graphify query untuk
 * resolve entity dari percakapan lama. Versi primitif ini TIDAK memanggil
 * Graphify (alat developer untuk knowledge graph -- lihat PLAN.md §1.1,
 * bukan sesuatu yang bisa dipanggil dari runtime production Command Room tanpa
 * infrastruktur MCP/service terpisah yang belum ada, blueprint §10). Sebagai
 * gantinya, Context Recall primitif membaca langsung dari durable_memories
 * (services/db, dibangun Fase 4) yang scope-nya cocok dengan project_id aktif
 * -- source yang sama yang nanti diindeks Graphify di fase lanjutan, hanya saja
 * dibaca langsung tanpa lapisan graph di antaranya.
 *
 * OPSIONAL, sama seperti Memory Distiller Fase 4: tidak disambungkan otomatis
 * ke route.ts. Menyambungkannya berarti Command Room butuh durable_memories
 * terisi data nyata dulu (lewat Memory Distiller + write-policy yang disetujui
 * owner) -- kalau dipasang sekarang saat tabelnya kosong, ContextPack yang
 * dihasilkan akan selalu kosong dan hanya menambah 1 HTTP call tanpa manfaat.
 */
import type { ContextEvidence, ContextPack, MemoryScope } from "./types";

interface DurableMemoryRecord {
  id: string;
  scope: string;
  scope_ref_id: string | null;
  type: string;
  content: string;
  confidence: number;
  source_type: string;
  source_id: string | null;
  created_at: string;
}

export interface RecallContextParams {
  dbApiUrl: string;
  projectId?: string;
  scope?: MemoryScope;
  fetchImpl?: typeof fetch;
}

/**
 * Baca durable_memories yang relevan dengan project_id aktif dari services/db.
 * Mengembalikan ContextPack -- kalau services/db tidak bisa dihubungi atau
 * tidak ada memory, mengembalikan pack kosong (bukan error) karena Context
 * Recall harus gagal aman: Command Room tetap bisa menjawab tanpa memory lama.
 */
export async function recallContext(params: RecallContextParams): Promise<ContextPack> {
  const scope: MemoryScope = params.scope ?? (params.projectId ? "project" : "conversation");
  const empty: ContextPack = {
    scope,
    project_id: params.projectId,
    user_context: {},
    project_context: {},
    memory_evidence: [],
    file_evidence: [],
    module_evidence: [],
    conflicts: [],
    missing: [],
  };

  if (!params.projectId) {
    empty.missing.push("project_id tidak tersedia -- Context Recall hanya mendukung scope project untuk saat ini.");
    return empty;
  }

  const fetchImpl = params.fetchImpl ?? fetch;
  try {
    const url = new URL(`${params.dbApiUrl.replace(/\/+$/, "")}/memory/durable`);
    url.searchParams.set("scope", scope);
    url.searchParams.set("scope_ref_id", params.projectId);
    url.searchParams.set("status", "active");
    const res = await fetchImpl(url.toString());
    if (!res.ok) {
      empty.missing.push(`Gagal membaca durable_memories: HTTP ${res.status}`);
      return empty;
    }
    const records = await res.json() as DurableMemoryRecord[];
    const memory_evidence: ContextEvidence[] = records.map((record) => ({
      type: record.type,
      content: record.content,
      source: record.source_id ? `${record.source_type}:${record.source_id}` : record.source_type,
      confidence: record.confidence,
    }));
    return { ...empty, memory_evidence };
  } catch (err) {
    empty.missing.push(err instanceof Error ? err.message : "durable_memories tidak dapat dihubungi");
    return empty;
  }
}
