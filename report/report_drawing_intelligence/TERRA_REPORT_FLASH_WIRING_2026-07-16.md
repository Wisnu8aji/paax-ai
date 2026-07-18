# Terra Report — Flash/Pro Level Semantic Wiring — 2026-07-16

## Scope

Perubahan dibatasi pada `services/document-intelligence` (plus laporan ini).
Tidak ada perubahan ke `services/db`, `apps/web`, `packages/schemas`, Command
Room, atau engine perhitungan. Tidak ada commit atau push.

## Hasil implementasi

- `level_canonicalizer.py` kini menjalankan provider opsional untuk
  `FLOOR_NAME_AMBIGUOUS` dan `UNCLASSIFIED`, dengan kontrak kandidat berisi
  level kanonis proyek serta evidence konteks.
- Proposal Flash dipanggil lebih dahulu. Jalur Pro hanya dipanggil apabila
  confidence Flash di bawah `0.75`, atau kandidat sama sekali tidak memiliki
  klasifikasi deterministik.
- Hanya `merge_to` yang menunjuk level kanonis proyek yang diterima. Target
  tidak ada dan proposal lintas lantai bernomor berbeda diturunkan menjadi
  `possibly_same`; hasil semantic merge tetap berstatus review.
- Audit immutable menyimpan candidate input, output provider, rationale,
  keputusan tervalidasi, model, prompt version, dan SHA-256 prompt hash.
- `DeepSeekLevelProvider` memakai request JSON, retry, parsing, base URL, dan
  key `DRAWING_INTELLIGENCE_API_KEY` yang sama dengan provider DeepSeek PCKM.
  Model Pro dibaca dari `DRAWING_INTELLIGENCE_DEEPSEEK_PRO_MODEL` (default
  `deepseek-v4-pro`); key Command Room tidak digunakan.
- `synthesize_project_graph()` menerima `level_provider` untuk injection test
  dan mengaktifkan provider env hanya bila key Drawing Intelligence tersedia.
- Script manual non-CI tersedia di
  `services/document-intelligence/scripts/smoke_level_provider.py`.

## Test

- `python -m pytest tests/test_project_graph_synthesis.py tests/test_project_graph_providers.py -q`
  → **53 passed**; seluruh provider memakai stub/transport palsu, tanpa network.
- Test baru mencakup merge `Main Level Two` ke `Lantai 2`, target tidak ada,
  Flash confidence rendah → Pro, larangan lintas lantai bernomor, injection
  synthesis, dan regresi tanpa provider.
- `python -m compileall -q app/project_graph` dan `git diff --check --
  services/document-intelligence` → exit 0.
- `python -m pytest -q` penuh dicoba ulang dengan batas 10 menit, tetapi
  runner timeout tanpa output assertion sebelum selesai. Karena itu suite
  penuh **tidak diklaim hijau** pada worktree ini.

## Graph

`graphify update .` selesai: 6.150 nodes, 12.127 edges, 409 communities.
Graphify melaporkan warning parser yang sudah dikenal untuk 10 source tanpa
node dan dependensi opsional `tree_sitter_sql`; tidak terkait wiring ini.
