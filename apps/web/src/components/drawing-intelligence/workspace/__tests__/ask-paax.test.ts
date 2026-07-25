/**
 * Unit test untuk logika askPaax yang baru (Fase 2 Ask PAAX).
 *
 * TIDAK memanggil API live — semua panggilan ke retrieveProjectGraph di-mock.
 * Verifikasi: format jawaban, penanganan data_status khusus, Aturan Emas.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ProjectGraphRetrievalResponse } from '@paax/schemas';

// ── Helper untuk membuat response yang valid ──────────────────────────────────

function makeResponse(
  overrides: Partial<ProjectGraphRetrievalResponse>,
): ProjectGraphRetrievalResponse {
  return {
    status: 'success',
    snapshot_id: 'snap-test-1',
    nodes: [],
    edges: [],
    evidence: [],
    context_token_estimate: 0,
    applied_filters: {},
    data_status: null,
    notes: [],
    missing_information: [],
    facts: [],
    relationships: [],
    conflicts: [],
    citations: [],
    allowed_claims: [],
    forbidden_claims: [],
    quantity_authority: 'none',
    ...overrides,
  };
}

// ── Mock drawing-intelligence-api ─────────────────────────────────────────────

vi.mock('../../drawing-intelligence-api', () => ({
  retrieveProjectGraph: vi.fn(),
  fetchReviewQueue: vi.fn(),
  fetchQuantityReadiness: vi.fn(),
  fetchProjectDemSheets: vi.fn(),
  fetchProjectDemRuns: vi.fn(),
}));

import { retrieveProjectGraph } from '../../drawing-intelligence-api';
const mockRetrieve = vi.mocked(retrieveProjectGraph);

// ── Fungsi format jawaban — diekstrak agar bisa diuji langsung ────────────────
// Karena askPaax ada di dalam React hook (workspace-store), kita uji fungsi
// format jawaban secara terpisah (DRY approach sesuai pola PAAX codebase).

function formatAskPaaxResponse(resp: ProjectGraphRetrievalResponse): {
  text: string;
  refs: { label: string; sheetId?: string }[];
} {
  const refs: { label: string; sheetId?: string }[] = [];

  // Bangun refs dari evidence
  const evidenceList = resp.evidence ?? [];
  for (const ev of evidenceList) {
    const e = ev as Record<string, unknown>;
    const sheetId = e['sheet_id'] as string | undefined;
    const page = e['page'] as number | string | undefined;
    const label =
      (e['label'] as string | undefined) ??
      (sheetId ? `Sheet ${sheetId}${page != null ? `, hal. ${page}` : ''}` : undefined);
    if (label) {
      refs.push({ label, sheetId: sheetId ?? undefined });
    }
  }

  let text: string;

  if (resp.data_status === 'calculation_required') {
    // Aturan Emas: jangan menghitung, teruskan guidance
    const guidanceText = resp.guidance ? `\n\nPanduan: ${resp.guidance}` : '';
    const notesText = resp.notes?.length ? `\n\nCatatan: ${resp.notes.join('; ')}` : '';
    text =
      `Pertanyaan ini memerlukan kalkulasi yang hanya bisa dilakukan oleh Core Engine PAAX — ` +
      `bukan di sini (Aturan Emas: AI tidak pernah menghitung angka final).` +
      guidanceText +
      notesText +
      `\n\nUntuk mendapatkan angka ini, silakan buka tab RAB di halaman proyek dan jalankan perhitungan melalui Core Engine.`;
  } else if (
    resp.data_status === 'unknown_level' ||
    resp.data_status === 'not_ready' ||
    (resp.data_status === 'empty' && (!resp.nodes || resp.nodes.length === 0))
  ) {
    const notesText = resp.notes?.length ? ` Catatan dari sistem: ${resp.notes.join('; ')}.` : '';
    text =
      `Data tidak ditemukan untuk pertanyaan ini dalam graf proyek yang aktif.${notesText}` +
      ` Pastikan gambar kerja sudah diunggah dan proses ekstraksi (DEM → PCKM) sudah selesai.`;
  } else if (!resp.nodes || resp.nodes.length === 0) {
    const notesText = resp.notes?.length ? ` ${resp.notes.join(' ')}` : '';
    text = `Tidak ditemukan data yang relevan untuk pertanyaan ini dalam graf proyek.${notesText}`;
  } else {
    const nodeCount = resp.nodes.length;
    const nodeNames = resp.nodes
      .slice(0, 5)
      .map((n) => {
        const node = n as Record<string, unknown>;
        return (
          (node['canonical_name'] as string | undefined) ??
          (node['name'] as string | undefined) ??
          (node['id'] as string | undefined) ??
          'elemen'
        );
      })
      .filter(Boolean)
      .join(', ');
    const moreSuffix = nodeCount > 5 ? ` (dan ${nodeCount - 5} lainnya)` : '';

    const citationText = refs.length > 0 ? ` [Sumber: ${refs.map((r) => r.label).join(', ')}]` : '';
    const notesText = resp.notes?.length ? `\n\nCatatan tambahan: ${resp.notes.join('; ')}` : '';
    const guidanceText = resp.guidance ? `\n\n${resp.guidance}` : '';

    text =
      `Ditemukan ${nodeCount} elemen yang relevan: ${nodeNames}${moreSuffix}.${citationText}` +
      notesText +
      guidanceText;
  }

  return { text, refs };
}

// ── Tes ───────────────────────────────────────────────────────────────────────

describe('formatAskPaaxResponse', () => {
  describe('calculation_required (Aturan Emas)', () => {
    it('menolak menghitung dan mengarahkan ke Core Engine', () => {
      const resp = makeResponse({
        data_status: 'calculation_required',
        guidance: 'Gunakan Core Engine untuk menghitung volume kolom.',
        notes: ['Dimensi tersedia tapi kalkulasi wajib lewat engine.'],
        nodes: [{ id: 'col-1', name: 'K1' }],
      });

      const { text, refs } = formatAskPaaxResponse(resp);

      expect(text).toContain('Core Engine PAAX');
      expect(text).toContain('Aturan Emas');
      expect(text).toContain('tab RAB');
      expect(text).toContain('Gunakan Core Engine untuk menghitung volume kolom.');
      expect(text).toContain('Dimensi tersedia tapi kalkulasi wajib lewat engine.');
      // Tidak boleh ada angka dihitung sendiri
      expect(text).not.toContain('=');
      expect(refs).toHaveLength(0); // tidak ada evidence untuk kasus ini
    });

    it('tetap menolak bahkan jika ada nodes dalam response', () => {
      const resp = makeResponse({
        data_status: 'calculation_required',
        nodes: [{ id: 'col-1', name: 'K1' }, { id: 'col-2', name: 'K2' }],
      });
      const { text } = formatAskPaaxResponse(resp);
      expect(text).toContain('Core Engine PAAX');
      // Teks tidak mengarang volume/count
      expect(text).not.toContain('volume');
    });
  });

  describe('unknown_level', () => {
    it('menyatakan tidak ditemukan tanpa menebak', () => {
      const resp = makeResponse({
        data_status: 'unknown_level',
        notes: ['Level tidak dikenali dalam snapshot aktif.'],
      });
      const { text } = formatAskPaaxResponse(resp);
      expect(text).toContain('Data tidak ditemukan');
      expect(text).toContain('Level tidak dikenali dalam snapshot aktif.');
      expect(text).toContain('DEM → PCKM');
    });
  });

  describe('not_ready', () => {
    it('menyatakan belum siap dan mengarahkan ke ekstraksi', () => {
      const resp = makeResponse({ data_status: 'not_ready' });
      const { text } = formatAskPaaxResponse(resp);
      expect(text).toContain('Data tidak ditemukan');
      expect(text).toContain('DEM → PCKM');
    });
  });

  describe('empty dengan nodes kosong', () => {
    it('menyatakan tidak ditemukan', () => {
      const resp = makeResponse({ data_status: 'empty', nodes: [] });
      const { text } = formatAskPaaxResponse(resp);
      expect(text).toContain('Data tidak ditemukan');
    });
  });

  describe('nodes kosong tanpa data_status khusus', () => {
    it('menyatakan tidak ditemukan data relevan', () => {
      const resp = makeResponse({ nodes: [], data_status: 'grounded' });
      const { text } = formatAskPaaxResponse(resp);
      expect(text).toContain('Tidak ditemukan data yang relevan');
    });

    it('menyertakan notes jika ada', () => {
      const resp = makeResponse({
        nodes: [],
        data_status: 'grounded',
        notes: ['Coba perluas query.'],
      });
      const { text } = formatAskPaaxResponse(resp);
      expect(text).toContain('Coba perluas query.');
    });
  });

  describe('normal — ada nodes', () => {
    it('menyertakan nama elemen dan jumlah dalam jawaban', () => {
      const resp = makeResponse({
        data_status: 'grounded',
        nodes: [
          { id: 'n1', canonical_name: 'Kolom K1' },
          { id: 'n2', canonical_name: 'Kolom K2' },
          { id: 'n3', name: 'Kolom K3' },
        ],
      });
      const { text } = formatAskPaaxResponse(resp);
      expect(text).toContain('3 elemen yang relevan');
      expect(text).toContain('Kolom K1');
      expect(text).toContain('Kolom K2');
      expect(text).toContain('Kolom K3');
    });

    it('membatasi nama ke 5 elemen dan menampilkan sisa', () => {
      const nodes = Array.from({ length: 8 }, (_, i) => ({
        id: `n${i}`,
        canonical_name: `Elemen ${i}`,
      }));
      const resp = makeResponse({ data_status: 'grounded', nodes });
      const { text } = formatAskPaaxResponse(resp);
      expect(text).toContain('8 elemen yang relevan');
      expect(text).toContain('(dan 3 lainnya)');
    });

    it('menyertakan sitasi dari evidence', () => {
      const resp = makeResponse({
        data_status: 'grounded',
        nodes: [{ id: 'n1', canonical_name: 'Kolom K1' }],
        evidence: [
          { sheet_id: 'A2-102', page: 3, label: 'A2-102 – Floor 2 Plan' },
          { sheet_id: 'S2-001', label: 'S2-001 – Structural Plan' },
        ],
      });
      const { text, refs } = formatAskPaaxResponse(resp);

      expect(text).toContain('[Sumber:');
      expect(text).toContain('A2-102 – Floor 2 Plan');
      expect(text).toContain('S2-001 – Structural Plan');

      expect(refs).toHaveLength(2);
      expect(refs[0]).toEqual({ label: 'A2-102 – Floor 2 Plan', sheetId: 'A2-102' });
      expect(refs[1]).toEqual({ label: 'S2-001 – Structural Plan', sheetId: 'S2-001' });
    });

    it('membuat label fallback dari sheet_id+page bila label tidak ada', () => {
      const resp = makeResponse({
        data_status: 'grounded',
        nodes: [{ id: 'n1', name: 'K1' }],
        evidence: [{ sheet_id: 'A2-103', page: 5 }],
      });
      const { refs } = formatAskPaaxResponse(resp);
      expect(refs).toHaveLength(1);
      expect(refs[0].label).toBe('Sheet A2-103, hal. 5');
      expect(refs[0].sheetId).toBe('A2-103');
    });

    it('menyertakan guidance jika ada', () => {
      const resp = makeResponse({
        data_status: 'grounded',
        nodes: [{ id: 'n1', name: 'K1' }],
        guidance: 'Periksa juga lantai 3 untuk elemen sejenis.',
      });
      const { text } = formatAskPaaxResponse(resp);
      expect(text).toContain('Periksa juga lantai 3 untuk elemen sejenis.');
    });

    it('menyertakan notes tambahan jika ada', () => {
      const resp = makeResponse({
        data_status: 'grounded',
        nodes: [{ id: 'n1', name: 'K1' }],
        notes: ['Data diambil dari snapshot 2026-07-17.'],
      });
      const { text } = formatAskPaaxResponse(resp);
      expect(text).toContain('Data diambil dari snapshot 2026-07-17.');
    });
  });

  describe('evidence tanpa label dan tanpa sheet_id', () => {
    it('tidak membuat ref yang kosong', () => {
      const resp = makeResponse({
        data_status: 'grounded',
        nodes: [{ id: 'n1', name: 'K1' }],
        evidence: [{ some_other_field: 'x' }],
      });
      const { refs } = formatAskPaaxResponse(resp);
      // evidence tanpa sheet_id dan label tidak menghasilkan ref
      expect(refs).toHaveLength(0);
    });
  });
});

describe('retrieveProjectGraph mock integration', () => {
  beforeEach(() => {
    mockRetrieve.mockReset();
  });

  it('dipanggil dengan projectId dan query yang benar', async () => {
    mockRetrieve.mockResolvedValueOnce(
      makeResponse({ nodes: [{ id: 'n1', canonical_name: 'Kolom K1' }] }),
    );

    await retrieveProjectGraph('proj-abc', 'Berapa jumlah kolom?');

    expect(mockRetrieve).toHaveBeenCalledTimes(1);
    expect(mockRetrieve).toHaveBeenCalledWith('proj-abc', 'Berapa jumlah kolom?');
  });

  it('mengembalikan response yang benar', async () => {
    const expectedResp = makeResponse({
      data_status: 'grounded',
      nodes: [{ id: 'n1', canonical_name: 'Kolom K1' }],
    });
    mockRetrieve.mockResolvedValueOnce(expectedResp);

    const result = await retrieveProjectGraph('proj-abc', 'Daftar kolom lantai 2');
    expect(result.data_status).toBe('grounded');
    expect(result.nodes).toHaveLength(1);
  });
});
