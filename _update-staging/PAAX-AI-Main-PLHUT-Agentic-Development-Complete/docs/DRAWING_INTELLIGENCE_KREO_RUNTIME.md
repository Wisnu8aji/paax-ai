# PAAX Drawing Intelligence Tool Runtime

## Mengapa runtime ini ada

DEM menyimpan observasi per halaman. PCKM menggabungkan pengetahuan proyek. Sebelum implementasi ini, belum ada lapisan konsisten yang mengoordinasikan primitive vector, native text, zone, legend, schedule, similarity, geometry, dan review candidate seperti workflow Kreo.

Runtime baru mengisi lapisan tersebut tanpa menjadikannya quantity authority.

## Alur

```text
PDF/CAD/image
→ modality routing
→ page profile + native vector/text index
→ sheet semantics + plan zones
→ DEM fusion
→ project vocabulary
→ cross-sheet links
→ specialist tools
→ work-item candidates
→ review queue
→ package intelligence artifact
→ PCKM generation metadata + frontend workspace
```

## Mode

- **Fast:** package indexing semua halaman; descriptor berat dibangun secara lazy.
- **Balanced:** analisis zona dan kandidat lebih mendalam pada sheet relevan.
- **Deep:** ditujukan untuk specialist analysis dan review; belum berarti fully autonomous.

## Tool baseline

- Auto Count candidate via cross reference and vector similarity.
- Find Similar via positive/negative project examples.
- One-Click Area via closed vector boundary.
- One-Click Line via nearest vector path.
- Vocabulary and Smart Labels from legend/schedule/DEM/native text.
- Cross Reference plan occurrence to definition.

## Authority boundary

Drawing Intelligence may generate:

- observed labels;
- candidate geometry;
- semantic class;
- definition links;
- missing-information list;
- review tasks.

It may not generate final:

- physical count;
- length/area/volume;
- work quantity;
- cost;
- RAB.

Accepted geometry and facts must pass the existing human/Measurement Fact/Core Engine boundary.

## Reproducible benchmark

```powershell
python services/document-intelligence/scripts/run_kreo_adaptation_benchmark.py
```

The default runner uses the packaged PLHUT PDF and 88 DEM pages, performs no AI-provider call, and writes artifacts under:

```text
report/report_drawing_intelligence/kreo_adaptation_2026-07-21/
```
