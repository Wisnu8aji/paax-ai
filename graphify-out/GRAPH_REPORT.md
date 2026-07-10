# Graph Report - .  (2026-07-10)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 4263 nodes · 8829 edges · 283 communities (239 shown, 44 thin omitted)
- Extraction: 83% EXTRACTED · 17% INFERRED · 0% AMBIGUOUS · INFERRED: 1512 edges (avg confidence: 0.69)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `db2098ab`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Community 0
- Community 1
- Community 2
- Community 3
- Community 4
- Community 5
- Community 6
- Community 7
- Community 8
- Community 9
- Community 10
- Community 11
- Community 12
- Community 13
- Community 14
- Community 15
- Community 16
- Community 17
- Community 18
- Community 19
- Community 20
- Community 21
- Community 22
- Community 23
- Community 24
- Community 25
- Community 26
- Community 27
- Community 28
- Community 29
- Community 30
- Community 31
- Community 32
- Community 33
- Community 34
- Community 35
- Community 36
- Community 37
- Community 38
- Community 39
- Community 40
- Community 41
- Community 42
- Community 43
- Community 44
- Community 45
- Community 46
- Community 47
- Community 48
- Community 49
- Community 50
- Community 51
- Community 52
- Community 53
- Community 54
- Community 55
- Community 56
- Community 57
- Community 58
- Community 59
- Community 60
- Community 61
- Community 62
- Community 63
- Community 64
- Community 65
- Community 66
- Community 67
- Community 68
- Community 69
- Community 70
- Community 71
- Community 72
- Community 73
- Community 74
- Community 75
- Community 76
- Community 77
- Community 78
- Community 79
- Community 80
- Community 81
- Community 82
- Community 83
- Community 84
- Community 85
- Community 86
- Community 87
- Community 88
- Community 89
- Community 90
- Community 91
- Community 92
- Community 93
- Community 94
- Community 95
- Community 96
- Community 97
- Community 98
- Community 99
- Community 100
- Community 101
- Community 102
- Community 103
- Community 104
- Community 105
- Community 106
- Community 107
- Community 108
- Community 109
- Community 110
- Community 111
- Community 112
- Community 113
- Community 114
- Community 115
- Community 116
- Community 117
- Community 118
- Community 119
- Community 120
- Community 121
- Community 122
- Community 123
- Community 124
- Community 125
- Community 126
- Community 127
- Community 128
- Community 129
- Community 130
- Community 131
- Community 132
- Community 133
- Community 134
- Community 135
- Community 136
- Community 137
- Community 138
- Community 139
- Community 140
- Community 141
- Community 142
- Community 143
- Community 144
- Community 145
- Community 146
- Community 147
- Community 148
- Community 149
- Community 150
- Community 151
- Community 152
- Community 153
- Community 154
- Community 155
- Community 156
- Community 157
- Community 158
- Community 159
- Community 161
- Community 162
- Community 163
- Community 164
- Community 165
- Community 166
- Community 167
- Community 168
- Community 169
- Community 170
- Community 171
- Community 172
- Community 173
- Community 174
- Community 175
- Community 176
- Community 177
- Community 178
- Community 179
- Community 180
- Community 182
- Community 183
- Community 184
- Community 185
- Community 186
- Community 187
- Community 188
- Community 189
- Community 190
- Community 191
- Community 192
- Community 193
- Community 194
- Community 201
- Community 202
- Community 203
- Community 204
- Community 205
- Community 206
- Community 207
- Community 208
- Community 211
- Community 212
- Community 213
- Community 214
- Community 215
- Community 216
- Community 217
- Community 219
- Community 223
- Community 224
- Community 226
- Community 227
- Community 228
- Community 229
- Community 230
- Community 231
- Community 232
- Community 237
- Community 238
- Community 239
- Community 245
- Community 249
- Community 250

## God Nodes (most connected - your core abstractions)
1. `ElementRegistryEntry` - 97 edges
2. `consolidate_document()` - 60 edges
3. `FakeAiAssistClient` - 59 edges
4. `DindingParams` - 48 edges
5. `TanahParams` - 45 edges
6. `ArsitekturParams` - 45 edges
7. `MepParams` - 45 edges
8. `takeoff_tkg()` - 45 edges
9. `BajaParams` - 44 edges
10. `AtapParams` - 44 edges

## Surprising Connections (you probably didn't know these)
- `takeoff_tkg()` --calls--> `kategori_dari_kode()`  [INFERRED]
  services/core-engine/app/tkg/takeoff.py → packages/schemas/python/paax_schemas/tkg_taxonomy.py
- `test_kategori_prefiks_terpanjang_menang()` --calls--> `kategori_dari_kode()`  [INFERRED]
  services/core-engine/tests/test_tkg.py → packages/schemas/python/paax_schemas/tkg_taxonomy.py
- `consolidate_document()` --calls--> `kategori_dari_kode()`  [INFERRED]
  services/document-intelligence/app/perception/consolidate.py → packages/schemas/python/paax_schemas/tkg_taxonomy.py
- `_entry_category()` --calls--> `kategori_dari_kode()`  [INFERRED]
  services/document-intelligence/app/perception/work_items.py → packages/schemas/python/paax_schemas/tkg_taxonomy.py
- `section_for_category()` --calls--> `normalize_section()`  [INFERRED]
  services/document-intelligence/app/perception/work_items.py → packages/schemas/python/paax_schemas/wbs.py

## Import Cycles
- None detected.

## Communities (283 total, 44 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.01
Nodes (258): AanstampingSchema, AccessoryInputSchema, AhspCandidateSchema, AhspCoverageLineSchema, AHSPItem, AhspMapRequest, AhspMapRequestSchema, AhspMapResult (+250 more)

### Community 1 - "Community 1"
Cohesion: 0.06
Nodes (96): Level, assemble_sheet_from_page(), _cell(), _classify_header(), _extract_elements(), _extract_grid(), _extract_grid_from_notation(), _extract_levels() (+88 more)

### Community 2 - "Community 2"
Cohesion: 0.07
Nodes (81): AST, _as_number(), build_audit(), build_price_book(), build_review_rows(), _candidate_score(), _clean_number(), _eval_ast() (+73 more)

### Community 3 - "Community 3"
Cohesion: 0.07
Nodes (51): DindingParams, BajaRequest, takeoff_baja_ep(), takeoff_mep_advanced_ep(), ArsitekturRequest, ManualTakeoffResult, _r4(), PAAX Core Engine — Take-off §G subset: pondasi batu belah, penutup lantai + pli (+43 more)

### Community 4 - "Community 4"
Cohesion: 0.05
Nodes (59): ConfidenceResult, DataCoverageResult, QaResult, build_boe(), BrainBoe, BrainBoeRequest, _clamp(), _r4() (+51 more)

### Community 5 - "Community 5"
Cohesion: 0.06
Nodes (60): ALLOWED_IMAGE_MIME_TYPES, buildMockChatResponse(), buildMockRabItems(), buildMockSchedule(), buildSafeChatError(), CHAT_RETRY_STATUS_CODES, demoCodeList, getGeminiClient() (+52 more)

### Community 6 - "Community 6"
Cohesion: 0.06
Nodes (48): formatDate(), formatSize(), ProjectGambarKerjaPage(), formatFileSize(), PerceptionReview, statusBox, { analyzeDrawingFileInBackgroundMock, saveMock, routerPushMock }, emptyDraft (+40 more)

### Community 7 - "Community 7"
Cohesion: 0.07
Nodes (49): DatabaseAhspPage(), iconBtn, ProjectRabPage(), ProjectSchedulePage(), HspBreakdownBody(), SCurveChart(), CoreEngineError, AHSPListItem (+41 more)

### Community 8 - "Community 8"
Cohesion: 0.07
Nodes (45): BackgroundTasks, analyze_drawing(), AnalyzeJobStatus, boq_preview(), BoqPreviewRequest, classify_drawing(), DrawingAnalysisResponse, DrawingAnalyzeRequest (+37 more)

### Community 9 - "Community 9"
Cohesion: 0.06
Nodes (51): delay_recovery(), generate(), ScheduleVersion, Schedule API routes — generate, scenarios, delay-recovery., Generate a project schedule for the given scenario., Generate Hemat / Normal / Cepat schedule variants., Analyze delays and generate a recovery plan., scenarios() (+43 more)

### Community 10 - "Community 10"
Cohesion: 0.20
Nodes (54): Aanstamping, AccessoryInput, AtapDetailRequest, AtapMiring, BajaMember, BajaRequest, BuiltUpPlate, Bukaan (+46 more)

### Community 11 - "Community 11"
Cohesion: 0.08
Nodes (37): ChatPage(), Message, MODULE_TABS, ProjectDetailLayout(), ProjectSwitcher(), ProjectSwitcherProps, buildDashboardPrefetchRoutes(), PrefetchProject (+29 more)

### Community 12 - "Community 12"
Cohesion: 0.08
Nodes (49): Computation, ElementSpec, BaseModel, PAAX Core Engine — Model Geometri → Volume.  Jembatan visi PAAX: AI membaca gamb, VolumeRequest, VolumeResult, _balok(), compute_volume() (+41 more)

### Community 13 - "Community 13"
Cohesion: 0.08
Nodes (50): AiZoneSuggestion, AiArsitekturAreaSuggestion, suggest_arsitektur_area(), _build_user_prompt(), _number_matches(), _numbers_in_texts(), AiKudaKudaSuggestion, AI-assist kuda-kuda baja profil.  Berat profil (`kg_per_m`) adalah DATA dari t (+42 more)

### Community 14 - "Community 14"
Cohesion: 0.07
Nodes (32): Shell(), PengaturanRedirect(), WorkspaceOverlays(), DEFAULT_PREFS, loadPrefs(), Prefs, SettingsDialog(), TABS (+24 more)

### Community 15 - "Community 15"
Cohesion: 0.05
Nodes (48): Store, get_current_user(), BaseModel, HTTPAuthorizationCredentials, Request, User, brain_confidence(), calculate() (+40 more)

### Community 16 - "Community 16"
Cohesion: 0.09
Nodes (45): CustomScenarioResult, ItemSchedule, ScenarioLineInput, ScenarioResult, CustomItemSchedule, CustomScenarioResult, ItemSchedule, BaseModel (+37 more)

### Community 17 - "Community 17"
Cohesion: 0.07
Nodes (44): initialize_chat(), load_api_key(), main(), Streamlit entry point for PAAX AI v0.1., Load the API key while allowing environment-only configuration., Initialize the active session with the assistant greeting., Reset the active conversation while preserving other settings., Render and run the PAAX AI Streamlit application. (+36 more)

### Community 18 - "Community 18"
Cohesion: 0.08
Nodes (38): _bbox_from_points(), _bbox_from_relative(), extract_spans_via_nvidia(), _image_data_url(), _image_size(), _model_env(), _nvidia_key_env(), NvidiaVisionClient (+30 more)

### Community 19 - "Community 19"
Cohesion: 0.13
Nodes (43): DrawingWorkItem, DrawingWorkItemsResult, _ai_prompt(), AiReportClient, _assumption_is_noise(), build_ai_report(), _build_local_report(), _clip_text() (+35 more)

### Community 20 - "Community 20"
Cohesion: 0.04
Nodes (46): ApiError, ApprovalRequest, ApprovalStatus, Assumption, BoqDraftItem, BOQItem, ChatMessage, ChatMode (+38 more)

### Community 21 - "Community 21"
Cohesion: 0.08
Nodes (27): FilesPage(), buildStats(), ProyekPage(), rabDisplay(), ProjectOverviewPage(), STUDIO_MODULES, RabHealthPanel(), scoreColor() (+19 more)

### Community 22 - "Community 22"
Cohesion: 0.14
Nodes (39): CPMRequest, SchedulePlanRequest, schedule_cpm(), schedule_plan(), RABResult, SCurvePoint, SCurveResult, build_s_curve_cpm() (+31 more)

### Community 23 - "Community 23"
Cohesion: 0.05
Nodes (15): Test integrasi API PAAX Core Engine. Menggunakan FastAPI TestClient (tidak perl, Nilai acuan:           AHSP.CK.001 vol=50: 50 × 145387 = 7.269.350           A, Titik terakhir Kurva S sequential harus = 100.0, Titik terakhir Kurva S parallel harus = 100.0, Kurva S harus selalu naik atau sama, tidak pernah turun, HSP AHSP.CK.001 Jawa Tengah = 145.387 (dihitung manual di test_rab.py), TestAHSP, TestDataCoverage (+7 more)

### Community 24 - "Community 24"
Cohesion: 0.09
Nodes (35): CorrectionRecord, EvalRunResult, ReviewCandidate, ReviewTriageResult, EvalCase, EvalCaseResult, EvalRunRequest, EvalRunResult (+27 more)

### Community 25 - "Community 25"
Cohesion: 0.05
Nodes (39): description, devDependencies, turbo, @types/body-parser, @types/express, @types/http-errors, @types/node, @types/qs (+31 more)

### Community 26 - "Community 26"
Cohesion: 0.10
Nodes (34): data_dir(), DataStore, load_data(), Path, ResourcePrice, PAAX Core Engine — Loader data AHSP & harga satuan.  Membaca semua file JSON d, AHSPItem, Component (+26 more)

### Community 27 - "Community 27"
Cohesion: 0.06
Nodes (38): Disposition, loadStore(), S, storageKey(), TriageItemView, TriagePanel(), AhspRow, ahspRows (+30 more)

### Community 28 - "Community 28"
Cohesion: 0.10
Nodes (29): RabResultTable(), ScurvePanel(), CandidatesTable(), candidateTone, ItemScheduleTable(), Row, TimeCostChart(), hspCategoryTone (+21 more)

### Community 29 - "Community 29"
Cohesion: 0.09
Nodes (37): AiAssistClient, Protocol, Kontrak client AI-assist. HANYA menerima teks (system+user prompt)     dan sche, _apply_arsitektur_area_ai_assist(), _apply_dimension_ai_assist(), _apply_dinding_ai_assist(), _apply_kuda_kuda_ai_assist(), _apply_kusen_ai_assist() (+29 more)

### Community 30 - "Community 30"
Cohesion: 0.17
Nodes (36): Dimension, ElementInstance, Grid, GridAxis, GridSpan, GridTotal, Level, BaseModel (+28 more)

### Community 31 - "Community 31"
Cohesion: 0.10
Nodes (29): ElementSeed, ImpliedRequest, WbsCompletenessRequest, workitems_completeness(), workitems_implied(), check_wbs_completeness(), WbsCompletenessRequest, expand_elements() (+21 more)

### Community 32 - "Community 32"
Cohesion: 0.09
Nodes (33): SCurveResult, main(), Demo cepat engine — jalankan: python -m app.demo  (dari folder services/core-eng, rp(), s_curve(), apply_rounding(), compute_hsp(), compute_rab() (+25 more)

### Community 33 - "Community 33"
Cohesion: 0.19
Nodes (32): _area_m2(), _bekisting(), berat_per_meter(), _besi(), _besi_pelat(), _beton(), _count_direct(), _Ctx (+24 more)

### Community 34 - "Community 34"
Cohesion: 0.24
Nodes (32): group_work_items(), DindingTakeoffClient, Protocol, KusenTakeoffClient, Protocol, Protocol, TanahTakeoffClient, _bridged_arsitektur_area_item() (+24 more)

### Community 35 - "Community 35"
Cohesion: 0.15
Nodes (25): AtapTakeoffClient, _bridge_generic(), bridge_gording(), bridge_ikatan_angin(), bridge_trekstang(), BridgedAtapLine, HttpAtapTakeoffClient, Any (+17 more)

### Community 36 - "Community 36"
Cohesion: 0.14
Nodes (23): ChatStatus, filterLabels, FilterMode, PendingAttachment, ProjectChatPage(), SUPPORTED_ATTACHMENT_MIME_TYPES, ChatFolder, ChatHistoryState (+15 more)

### Community 37 - "Community 37"
Cohesion: 0.09
Nodes (25): assemble_document_from_pdf_bytes(), TkgDocument, Kembalikan (TkgDocument, metrics per-sheet) — dipakai P4 utk agregasi METRICS., build_synthetic_table_pdf_bytes(), Fase 2 P3 — PDF sintetis NON-PLHUT dengan tabel BERGARIS asli (§0.1).  Gaya ba, Fase 2 P4 — uji integrasi endpoint /drawings/analyze memakai pipeline baru., Fase F: proses latar belakang — job_id segera, poll sampai COMPLETED     dgn ha, test_analyze_returns_real_metrics_and_gerbang() (+17 more)

### Community 38 - "Community 38"
Cohesion: 0.20
Nodes (29): RebarSpec, BaseModel, TakeoffParams, takeoff_tkg(), Anchor nyata terverifikasi: `buat_tkg()` -> `takeoff_tkg()` -> SL1     (sloof), test_end_to_end_takeoff_tkg_lalu_suggest_ahsp_real_catalog(), _doc_satu_elemen(), _items() (+21 more)

### Community 39 - "Community 39"
Cohesion: 0.17
Nodes (26): ArsitekturRequest, DindingRequest, TanahRequest, _dinding_lengkap(), _item(), Manual: area 120 -> 120 m2; volume 18 -> 18 m3; 7 km -> kelas sedang., Manual: sponningan 6 m x 2 = 12 m; panel 7x3 melewati L4/A12 -> review., test_fe04_sponningan_dan_fe06_praktis_review() (+18 more)

### Community 40 - "Community 40"
Cohesion: 0.11
Nodes (25): AiArsitekturAreaSuggestion, AiDimensionSuggestion, AiDindingSuggestion, AiKudaKudaSuggestion, AiKusenSuggestion, AiMepSuggestion, AiRoofFrameSuggestion, AiZoneSuggestion (+17 more)

### Community 41 - "Community 41"
Cohesion: 0.15
Nodes (25): BusyKey, FIELDS, SmartRabImport(), cell(), ColumnMapping, detectPriceAnomalies(), firstTable(), parseRabImportFile() (+17 more)

### Community 42 - "Community 42"
Cohesion: 0.14
Nodes (27): buildGeminiPrompt(), buildNvidiaExtractPrompt(), ChatModelName, ChatModelSelection, deepseekError(), deepseekText(), ExtractedElementList, ExtractedElementSchema (+19 more)

### Community 43 - "Community 43"
Cohesion: 0.17
Nodes (26): classify_zone(), extract_judul(), extract_skala(), PAAX Document Intelligence — Klasifikasi zona/paket-pekerjaan per sheet (Fase B, Klasifikasi zona dari judul. `page_index`/`has_grid`/`has_elements`     OPSIONA, Judul = teks berawalan kata kunci sheet (DENAH/TABEL/dst) yang PALING     SERIN, Fase B (rencana besar 2026-07-05) — test zone/judul/skala classifier.  Fixture, Bukti nyata: 'DAFTAR SINGKATAN DAN NOTASI GAMBAR' (halaman legenda,     BUKAN d (+18 more)

### Community 44 - "Community 44"
Cohesion: 0.08
Nodes (25): dependencies, zod, description, devDependencies, jest, @paax/tsconfig, ts-jest, tsup (+17 more)

### Community 45 - "Community 45"
Cohesion: 0.19
Nodes (15): bridge_dinding_pasangan(), BridgedDindingLine, HttpDindingTakeoffClient, Any, PAAX Document Intelligence — Bridging dinding pasangan bata ke core-engine `/ta, _review(), _entry(), FakeDindingClient (+7 more)

### Community 46 - "Community 46"
Cohesion: 0.10
Nodes (15): CommandRoomPage(), filterLabels, FilterMode, PendingAttachment, SideTab, SUPPORTED_MIME, updatedLabel(), PaaxMark() (+7 more)

### Community 47 - "Community 47"
Cohesion: 0.10
Nodes (22): format_currency(), format_date_id(), format_number(), format_percentage(), date, datetime, Formatting utilities — Indonesian currency, date, and number formatting., Format a number as Indonesian Rupiah, e.g. 'Rp 1.500.000'. (+14 more)

### Community 48 - "Community 48"
Cohesion: 0.15
Nodes (23): bind_alamat(), _edge_and_direction(), _format_offset(), _format_pair(), _is_alpha(), _nearest(), PAAX Document Intelligence — Label->grid binding + notasi offset (brain-00 §5, F, Alamat gabungan SELALU huruf dulu baru angka, apa pun yang kebetulan     jadi su (+15 more)

### Community 49 - "Community 49"
Cohesion: 0.11
Nodes (23): _katalog_sintetis(), AHSPItem, Fase T (rencana besar 2026-07-13) — test `app.mapping.takeoff_ahsp`.  Anchor n, Katalog sintetis ini sengaja HANYA punya 1 item struktur besi (tidak     ada va, Query fc-based TIDAK menyertakan kata kategori ("kolom"/"sloof"), jadi     kedu, Kategori 'tangga' work_type 'besi' TIDAK ada di `_BESI_QUERY` --     fallback g, `suggest_ahsp_for_takeoff` menerima `List[TakeoffItem]` pydantic asli     (buka, Anchor nyata terverifikasi: 'bekisting fondasi telapak' skor 0.5833     thd kan (+15 more)

### Community 50 - "Community 50"
Cohesion: 0.11
Nodes (21): analyzeDrawingFile(), analyzeDrawingFileInBackground(), AnalyzeJobStatusResponse, assertPdf(), ConsolidatedAssumption, ConsolidatedBuildingDimensions, ConsolidatedElementDefinisi, ConsolidatedElementInstanceRef (+13 more)

### Community 51 - "Community 51"
Cohesion: 0.15
Nodes (21): GridAxis, GridSpan, GridTotal, Rect, BaseModel, PAAX Document Intelligence — Perception fondasi (Fase 2 P1).  TextSpan/Run ada, Run, _Bubble (+13 more)

### Community 52 - "Community 52"
Cohesion: 0.16
Nodes (21): _as_aware_utc(), check_quota(), _cosine_distance(), create_project(), get_project(), get_rab(), get_tkg(), get_usage_anomalies() (+13 more)

### Community 53 - "Community 53"
Cohesion: 0.15
Nodes (22): create_tool_call_audit(), index_knowledge(), save_rab(), update_project(), AiUsageLogCreate, AiUsageLogResponse, KnowledgeChunkCreate, KnowledgeChunkResponse (+14 more)

### Community 54 - "Community 54"
Cohesion: 0.17
Nodes (16): bridge_mep_point(), BridgedMepLine, HttpMepTakeoffClient, MepTakeoffClient, Any, Protocol, PAAX Document Intelligence — Bridging titik MEP ke core-engine `/takeoff/mep` (, _review() (+8 more)

### Community 55 - "Community 55"
Cohesion: 0.19
Nodes (19): ChatBodySchema, envNumber(), envValue(), fetchEngineStatus(), GET(), nvidiaKeyForChat(), nvidiaModelEnv(), POST() (+11 more)

### Community 56 - "Community 56"
Cohesion: 0.12
Nodes (17): get_ahsp_library(), Demo AHSP library — realistic unit-price analysis data for common work items., Return a demo library of AHSP recipes., find_recipe_for_item(), get_all_recipes(), AHSP mapper — map RAB work items to AHSP recipes., Find the best-matching AHSP recipe for a given work-item description., Return the full AHSP library. (+9 more)

### Community 57 - "Community 57"
Cohesion: 0.09
Nodes (21): compilerOptions, declaration, declarationMap, esModuleInterop, forceConsistentCasingInFileNames, incremental, isolatedModules, lib (+13 more)

### Community 58 - "Community 58"
Cohesion: 0.12
Nodes (20): AiDimensionSuggestion, _as_optional_float(), _build_user_prompt(), _in_plausible_range(), _matches_available_number(), _numbers_in_texts(), Any, PAAX Document Intelligence — AI-assist slice #1: dimensi footplat dari halaman (+12 more)

### Community 59 - "Community 59"
Cohesion: 0.20
Nodes (19): buildPayload(), CommandRoomChatBody, CommandRoomChatSchema, DeepSeekMessage, DeepSeekPayload, GET(), getDeepSeekBaseUrl(), getDeepSeekKey() (+11 more)

### Community 60 - "Community 60"
Cohesion: 0.10
Nodes (20): dependencies, cors, express, firebase-admin, zod, devDependencies, tsx, @types/cors (+12 more)

### Community 61 - "Community 61"
Cohesion: 0.17
Nodes (14): BajaTakeoffClient, bridge_kuda_kuda(), BridgedKudaKudaLine, HttpBajaTakeoffClient, Any, Protocol, _review(), FakeBajaClient (+6 more)

### Community 62 - "Community 62"
Cohesion: 0.14
Nodes (17): build_tkg(), BaseModel, TkgBuildRequest, bridge_kusen_schedule(), BridgedKusenLine, HttpKusenTakeoffClient, Any, PAAX Document Intelligence — Bridging jadwal kusen pintu/jendela ke core-engine (+9 more)

### Community 63 - "Community 63"
Cohesion: 0.14
Nodes (17): detect_wall_polygons(), _get_scale_mm_per_px(), Grid, Page, PAAX Document Intelligence — Ekstraksi geometri dinding dari polygon., Mengestimasi skala mm/px dari rentang Grid dan axis_points., Ekstrak total panjang dinding dari segmen garis polygon, dengan deduplikasi., WallSegment (+9 more)

### Community 64 - "Community 64"
Cohesion: 0.10
Nodes (19): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+11 more)

### Community 65 - "Community 65"
Cohesion: 0.26
Nodes (19): ComponentCost, RABLine, SectionedRABResult, _apply_basic_widths(), export_rab_to_excel(), _ordered_lines(), HSPBreakdown, Worksheet (+11 more)

### Community 66 - "Community 66"
Cohesion: 0.10
Nodes (19): AiArsitekturAreaSuggestionSchema, AiKudaKudaSuggestionSchema, CPMRequest, CPMResult, DrawingWorkItemsResultSchema, HSPBreakdown, RABLineInput, RABResult (+11 more)

### Community 67 - "Community 67"
Cohesion: 0.24
Nodes (18): RABLineInput, _build(), Tes RAB tersektor (WBS). Anchor: CK.001 vol50 (III), CK.002 vol50 (IV).   amount, test_section_weights_sum_to_100(), test_sections_grouped_and_ordered(), test_titles_present(), test_unknown_section_goes_last(), _balanced() (+10 more)

### Community 68 - "Community 68"
Cohesion: 0.18
Nodes (13): bridge_galian_footplat(), BridgedTakeoffLine, _dimensi(), _first_dim(), HttpTanahTakeoffClient, Any, _review(), _unit_factor() (+5 more)

### Community 69 - "Community 69"
Cohesion: 0.15
Nodes (18): TkgDocument, TkgValidationResult, _baris(), TkgDocument, TkgValidationResult, PAAX Core Engine — Renderer TKG -> .tkg.txt (brain TXT00 §6).  Render teks DET, render_tkg_txt(), BbsDiameterSummary (+10 more)

### Community 70 - "Community 70"
Cohesion: 0.15
Nodes (18): _build_user_prompt(), has_kusen_keyword(), _numbers_in_texts(), _parse_row(), _ParsedRow, AiKusenSuggestion, Any, PAAX Document Intelligence — AI-assist slice #5: jadwal kusen pintu/jendela (20 (+10 more)

### Community 71 - "Community 71"
Cohesion: 0.16
Nodes (16): LevelResult, parse_level(), Parser level/peil (brain-00 §2.5). Tanda +/- WAJIB terbaca & benar., MutuResult, parse_mutu(), Parser mutu beton & profil baja (brain-00 §2.4). Simpan persis, tanpa tafsir (F-, Fase 2 P2 — anchor test parse_mutu + parse_level (brain-00 §2.4, §2.5)., test_fc_no_space() (+8 more)

### Community 72 - "Community 72"
Cohesion: 0.18
Nodes (17): _jenis_dari_huruf(), parse_rebar(), Parser notasi tulangan (brain-00 §2.2). D = ulir (BJTS), O/Ø = polos (BJTP). d/, RebarResult, Fase 2 P2 — anchor test parse_rebar (brain-00 §2.2)., test_bukan_rebar_returns_none(), test_pokok_10d16(), test_pokok_12d16() (+9 more)

### Community 73 - "Community 73"
Cohesion: 0.25
Nodes (17): TextSpan, _baseline_coord(), _build_run(), merge_runs(), PAAX Document Intelligence — Penyatuan fragmen span (RULE-EXT-03, Fase 2 P1)., RULE-EXT-03: kelompokkan span jadi Run sebelum grammar memprosesnya., _reading_end(), _reading_start() (+9 more)

### Community 74 - "Community 74"
Cohesion: 0.16
Nodes (17): Run deterministic checks on a RAB and return warnings.      Checks include: un, review(), KategoriPekerjaan, BaseModel, Enum, str, RABVersion, Pydantic models for RAB (Rencana Anggaran Biaya).  Terminology ----------- - (+9 more)

### Community 75 - "Community 75"
Cohesion: 0.11
Nodes (17): compilerOptions, declaration, declarationMap, esModuleInterop, forceConsistentCasingInFileNames, isolatedModules, module, moduleResolution (+9 more)

### Community 76 - "Community 76"
Cohesion: 0.20
Nodes (9): queryMaterialsTool, RESULT, queryProgressTool, RESULT, queryRabTool, createRunScenarioTool(), RunScenarioOptions, ToolDefinition (+1 more)

### Community 77 - "Community 77"
Cohesion: 0.16
Nodes (17): _build_user_prompt(), has_mep_keyword(), _numbers_in_texts(), _parse_row(), _ParsedRow, AiMepSuggestion, Any, PAAX Document Intelligence — AI-assist slice #6 (TERAKHIR dalam rangkaian dindi (+9 more)

### Community 78 - "Community 78"
Cohesion: 0.32
Nodes (13): ArsitekturTakeoffClient, _base_payload(), bridge_keramik_dinding(), bridge_plafon(), bridge_waterproofing(), BridgedArsitekturAreaLine, _from_engine_result(), HttpArsitekturTakeoffClient (+5 more)

### Community 79 - "Community 79"
Cohesion: 0.17
Nodes (14): _cluster_drawings(), count_door_window_symbols(), count_symbols_near_legend(), Page, PAAX Document Intelligence — Ekstraksi geometri simbol kusen dan MEP., Menghitung simbol di halaman yang mirip dengan simbol di legenda., Menghitung jumlah simbol arc_door dan rect_window di halaman., _rect_intersect_or_close() (+6 more)

### Community 80 - "Community 80"
Cohesion: 0.15
Nodes (12): OverviewPage(), quickIcons, rabDisplay(), STATUS_CHART_COLOR, ColumnDatum, DonutChart(), DonutSlice, HBarList() (+4 more)

### Community 81 - "Community 81"
Cohesion: 0.17
Nodes (13): RunStatus(), AIModelName, CommandRoomRunStoreState, getPreReasoningStatusLabel(), getReasoningContextStatus(), Listener, PRE_REASONING_STATUS_LABELS, RunState (+5 more)

### Community 82 - "Community 82"
Cohesion: 0.18
Nodes (12): executeQuerySchedule(), isScheduleSnapshot(), queryScheduleTool, createSearchKnowledgeTool(), executeSearchKnowledge(), searchKnowledgeDeclaration, ChatContext, RabLineSnapshot (+4 more)

### Community 83 - "Community 83"
Cohesion: 0.15
Nodes (10): GeminiAiAssistClient, _FakeHttpResponse, Any, Monkeypatch `urlopen` supaya test ini TIDAK PERNAH memanggil jaringan     sungg, test_gemini_client_degrades_gracefully_on_malformed_response(), test_gemini_client_degrades_gracefully_on_network_error(), test_gemini_client_from_env_returns_instance_with_api_key(), test_gemini_client_from_env_returns_none_without_api_key() (+2 more)

### Community 84 - "Community 84"
Cohesion: 0.15
Nodes (16): _build_user_prompt(), _FieldSpec, _numbers_in_texts(), AiRoofFrameSuggestion, Any, PAAX Document Intelligence — AI-assist slice #4: rangka atap non-beton (gording, Usulkan field numerik rangka atap (gording/trekstang/ikatan_angin)     dari tek, _response_schema() (+8 more)

### Community 85 - "Community 85"
Cohesion: 0.12
Nodes (6): Tests untuk PAAX Site Agent scaffold.  Skenario yang diverifikasi:   1. POST, Verifikasi bahwa seluruh kode app/ site-agent TIDAK mengimport:       - google., TestListSiteLogs, TestNotFound, TestNoVisionImport, TestValidation

### Community 86 - "Community 86"
Cohesion: 0.17
Nodes (14): Recalculate subtotals, PPN, contingency, and grand total.      Call this after, recalculate(), _generate_csv_fallback(), generate_rab_excel(), Template-based Excel export engine.  Uses openpyxl to generate formatted RAB s, Fallback CSV generation when openpyxl is not available., Generate a formatted RAB Excel workbook.      Returns the workbook as bytes (f, calculate_summary() (+6 more)

### Community 87 - "Community 87"
Cohesion: 0.12
Nodes (15): compilerOptions, allowImportingTsExtensions, isolatedModules, jsx, lib, module, moduleResolution, noEmit (+7 more)

### Community 88 - "Community 88"
Cohesion: 0.19
Nodes (12): geminiGenerateContent(), executeToolCall(), firstPart(), ToolCallLog, ToolLoopResult, GeminiContent, GeminiFunctionCall, GeminiFunctionDeclaration (+4 more)

### Community 89 - "Community 89"
Cohesion: 0.24
Nodes (15): AhspSearchRequest, _build_query(), _exclude_pracetak(), _fallback_query(), _fc_query(), AHSPItem, BaseModel, PAAX Core Engine — Fase T: usulan AHSP untuk `TakeoffItem` (rencana besar 2026- (+7 more)

### Community 90 - "Community 90"
Cohesion: 0.23
Nodes (13): parse_section(), Parser dimensi penampang & tebal (brain-00 §2.3). Satuan diisi via `units.infer_, SectionResult, infer_unit(), Inferensi satuan mm/cm (brain-00 §2.7) — dipilih dari RENTANG WAJAR, bukan diasu, UnitInferenceResult, Fase 2 P2 — anchor test parse_section + infer_unit (brain-00 §2.3, §2.7)., test_section_15x10_latei_infers_cm_with_assumption() (+5 more)

### Community 91 - "Community 91"
Cohesion: 0.21
Nodes (14): parse_type_code(), Parser kode tipe elemen (brain-00 §2.1). Fungsi murni: string -> hasil ATAU Non, TypeCodeResult, Fase 2 P2 — anchor test parse_type_code (brain-00 §2.1)., test_b2_balok(), test_code_with_slash_kept_raw_needs_review(), test_k1_kolom(), test_k1a_variant_different_from_k1() (+6 more)

### Community 92 - "Community 92"
Cohesion: 0.16
Nodes (14): _extract_from_doc(), extract_spans(), extract_spans_from_page(), extract_spans_from_path(), page_has_vector_text(), PAAX Document Intelligence — Ekstraksi span vektor dari PDF (Fase 2 P1).  RULE, Petakan vektor arah baca (cos, sin) PyMuPDF ke 0/90/180/270 derajat., Ekstrak seluruh text-span vektor dari PDF (semua halaman). (+6 more)

### Community 93 - "Community 93"
Cohesion: 0.20
Nodes (14): AhspMapResult, AhspSearchResult, ahsp_map(), ahsp_search(), AhspMapRequest, AhspSearchRequest, _included_from_name(), map_workitem_to_ahsp() (+6 more)

### Community 94 - "Community 94"
Cohesion: 0.24
Nodes (13): PriceBindingResult, AhspCandidate, AhspMapRequest, AhspSearchResult, PriceBindingLine, PriceBindingResult, PriceBindRequest, BaseModel (+5 more)

### Community 95 - "Community 95"
Cohesion: 0.23
Nodes (14): TkgIssue, _axis_positions_m(), _cek_v02(), _cek_v03(), grid_distance_m(), ke_meter(), Grid, PAAX Core Engine — Validator TKG (gerbang NO-MISTAKE, brain TXT00 §7).  Subset (+6 more)

### Community 96 - "Community 96"
Cohesion: 0.23
Nodes (13): create_site_log(), list_site_logs(), Simpan laporan harian lapangan.      actual_progress_pct WAJIB diisi manusia (, Ambil riwayat laporan harian lapangan untuk satu proyek., PAAX Site Agent — Models (Pydantic v2)  Aturan emas:   - actual_progress_pct, Laporan harian lapangan — HANYA diisi manusia terverifikasi., Laporan harian tersimpan., SiteLogInput (+5 more)

### Community 97 - "Community 97"
Cohesion: 0.15
Nodes (12): generate(), RABVersion, Generate a draft RAB from project parameters.      Uses demo pricing and propo, generate_rab(), RABVersion, Generate a complete RAB from project parameters.      Uses demo unit-price dat, GenerateRABRequest, RABItem (+4 more)

### Community 98 - "Community 98"
Cohesion: 0.14
Nodes (13): dependencies, @paax/schemas, zod, devDependencies, typescript, main, name, private (+5 more)

### Community 99 - "Community 99"
Cohesion: 0.32
Nodes (13): Pattern, build_report(), _exact_code_pattern(), extract_pdf_pages(), find_pdf_unit(), load_empty_unit_items(), main(), _md() (+5 more)

### Community 100 - "Community 100"
Cohesion: 0.22
Nodes (12): build_tkg_from_text(), classification_to_jenis(), Any, BaseModel, Parser SK-07 (MVP): regex per baris notasi terstruktur sederhana     ("GRID X:, _render(), _span(), TkgBuildResult (+4 more)

### Community 101 - "Community 101"
Cohesion: 0.25
Nodes (12): build_synthetic_grid_pdf_bytes(), Fase 2 P3-geometri — PDF sintetis NON-PLHUT dengan bubble-as + garis-dimensi NY, _grid_from_bytes(), Fase 2 P3-geometri — test `reconstruct_grid_from_geometry` (§3.1.1).  Fixture, 2 lingkaran kecil (label M/N) sejajar cx=520 TAPI beda ukuran dari     keluarga, Nilai acuan dihitung manual dari geometri PDF asli (bubble+garis     dimensi ha, test_smoke_real_plhut_grid_matches_manual_anchor(), test_synthetic_axes_and_positions_reconstructed() (+4 more)

### Community 102 - "Community 102"
Cohesion: 0.26
Nodes (5): DocumentIntelligenceClient, DrawingFileMetadata, VerifyCandidatePayload, DocumentIntelligenceHealth, DrawingAnalysisResult

### Community 103 - "Community 103"
Cohesion: 0.21
Nodes (11): generate_boq_from_rab(), BOQ generator — transform RAB groups into a BOQ document., Convert RAB groups/items into a formal BOQ document.      The BOQ mirrors the, BOQDocument, BOQItem, BOQSection, BaseModel, Pydantic models for BOQ (Bill of Quantities). (+3 more)

### Community 104 - "Community 104"
Cohesion: 0.26
Nodes (12): RABWarning, Single warning / flag from review or validation., RAB validators — deterministic checks on items and groups.  These are rule-bas, Check that the volume is positive and not absurdly high., Run all item-level validations across every group., Check that the item's unit is valid for its category., Check that the unit price is within a reasonable range for the category., validate_price_range() (+4 more)

### Community 105 - "Community 105"
Cohesion: 0.22
Nodes (7): generate_morning_report_endpoint(), generate_morning_report_data(), generate_report(), _mock_schedule_deviation(), AsyncSession, test_anti_hallucination(), test_rule_based_fallback()

### Community 106 - "Community 106"
Cohesion: 0.31
Nodes (12): build_resource_catalog(), _header_indices(), main(), norm(), _norm_unit(), parse_koef(), parse_pdf(), parse_table() (+4 more)

### Community 107 - "Community 107"
Cohesion: 0.19
Nodes (8): authMiddleware(), AppConfig, loadConfig(), app, config, RATE_LIMIT, rateLimitMap, healthHandler()

### Community 108 - "Community 108"
Cohesion: 0.24
Nodes (11): takeoff_smkk_ep(), BaseModel, ManualTakeoffResult, _r4(), PAAX Core Engine — Take-off SMKK / Keselamatan Konstruksi (deterministik).  St, SmkkRequest, takeoff_smkk(), _smkk_plhut() (+3 more)

### Community 109 - "Community 109"
Cohesion: 0.37
Nodes (10): _entry(), FakeArsitekturClient, AiArsitekturAreaSuggestion, _suggestion(), test_bridge_arsitektur_area_missing_required_field_requires_specific_review(), test_bridge_arsitektur_area_without_ai_suggestion_requires_review(), test_bridge_arsitektur_area_without_client_requires_review(), test_bridge_keramik_dinding_sends_exact_arsitektur_payload() (+2 more)

### Community 110 - "Community 110"
Cohesion: 0.17
Nodes (11): name, optionalDependencies, @tailwindcss/oxide-linux-x64-gnu, private, scripts, build, dev, lint (+3 more)

### Community 111 - "Community 111"
Cohesion: 0.17
Nodes (12): dependencies, firebase, framer-motion, lucide-react, next, @paax/schemas, @paax/types, react-dom (+4 more)

### Community 112 - "Community 112"
Cohesion: 0.17
Nodes (12): devDependencies, jsdom, tailwindcss, @tailwindcss/postcss, @testing-library/dom, @testing-library/react, @types/jsdom, @types/node (+4 more)

### Community 113 - "Community 113"
Cohesion: 0.21
Nodes (10): detectType(), extractLine(), parseNumbers(), RabExtractor, ruleBasedExtractor, TYPE_AHSP, TYPE_DIMS, TYPE_KEYWORDS (+2 more)

### Community 115 - "Community 115"
Cohesion: 0.18
Nodes (10): optimize(), RAB API routes — generate, recalculate, review, optimize.  All numerical resul, Attempt to reduce budget by target percentage.      Preserves structural and f, OptimizeRABRequest, OptimizeRABResponse, Request to optimise budget while preserving structural items., Response from POST /rab/optimize., optimize_rab() (+2 more)

### Community 116 - "Community 116"
Cohesion: 0.26
Nodes (11): RABGroup, Group of RAB items (divisi pekerjaan)., detect_empty_groups(), detect_missing_categories(), detect_proportion_anomalies(), generate_all_warnings(), RAB warning detectors — identify missing items, abnormal volumes, and price outl, Run all warning detectors. (+3 more)

### Community 117 - "Community 117"
Cohesion: 0.17
Nodes (11): description, name, private, scripts, build, check, dev, lint (+3 more)

### Community 118 - "Community 118"
Cohesion: 0.17
Nodes (11): compilerOptions, incremental, noEmit, noUncheckedIndexedAccess, outDir, resolveJsonModule, rootDir, types (+3 more)

### Community 119 - "Community 119"
Cohesion: 0.36
Nodes (9): runToolCallingLoop(), ChatBodySchema, createChatHandler(), systemPrompt, ChatBodySchema, createStreamHandler(), createToolRegistry(), checkQuota() (+1 more)

### Community 120 - "Community 120"
Cohesion: 0.23
Nodes (11): _doc_kolom(), TkgDocument, Golden Anchor PLHUT Kankemenag Surakarta 2024 + review perbaikan sesi PLHUT., Volume beton kolom: 10 x 0.4 x 0.4 x 4.0 = 6.4 m3., Berat 12D16 x 4 m: 12 x 4.0 x 1.578336 = 75.7601 kg (tanpa kait/lap)., test_anchor_plhut_besi_tulangan(), test_anchor_plhut_beton_kolom(), test_reuse_form_invalid_ditolak() (+3 more)

### Community 121 - "Community 121"
Cohesion: 0.17
Nodes (11): Golden anchor TKG PLHUT — dibangun dari GAMBAR KERJA ASLI (bukan sintetis).  S, Grid asli PLHUT: 5x4000=20000 dan 5000+3000+2000=10000 — gerbang V-02 lolos., 8 x 0.4 x 0.4 x 4.0 = 5.12 m3 (tinggi = parameter eksplisit, tercatat)., Pokok 10D16 + sengkang D10-300 — expected dihitung dari rumus mentah., Data nyata yang tidak lengkap TIDAK ditebak: telapak tanpa tebal -> REVIEW., Keempat tipe kolom LT1 punya beton+bekisting+besi (cakupan RULE-EXP)., test_plhut_besi_kolom_k1a_lt1(), test_plhut_beton_kolom_k1a_lt1() (+3 more)

### Community 122 - "Community 122"
Cohesion: 0.23
Nodes (6): Aktual 80%, rencana 50% → ahead (+30%), Aktual 50.5%, rencana 50% → on_track (|dev| ≤ 2%), Aktual 30%, rencana 70% → behind (-40%), Ambang on_track = |deviation| ≤ 2% — dikembalikan di response, Planned progress harus berasal dari RAB db-api + Kurva S core-engine., TestDeviation

### Community 123 - "Community 123"
Cohesion: 0.35
Nodes (8): envValue(), extractorKey(), GET(), POST(), nvidiaText(), buildTkgPrompt(), extractTkgWithProvider(), TkgExtractionResult

### Community 124 - "Community 124"
Cohesion: 0.31
Nodes (8): AsyncClient, test_knowledge_index_and_search(), _fetch_rab_payload(), _fetch_s_curve(), _planned_progress_at_day(), _planned_progress_from_services(), Any, PAAX Site Agent — FastAPI main application.  Port: 8085 Endpoints:   POST /s

### Community 125 - "Community 125"
Cohesion: 0.33
Nodes (10): Base, AiUsageLog, KnowledgeChunk, MorningReport, Project, ProjectMember, RabDraft, TenantQuota (+2 more)

### Community 126 - "Community 126"
Cohesion: 0.22
Nodes (9): normalize_section(), section_title(), build_sectioned_rab(), AHSPItem, RABLineInput, ResourcePrice, _row_by_value(), test_export_has_expected_sheets_and_formulas() (+1 more)

### Community 127 - "Community 127"
Cohesion: 0.31
Nodes (6): functionCallPart(), jsonResponse(), sequenceFetch(), textPart(), echoTool, response()

### Community 128 - "Community 128"
Cohesion: 0.18
Nodes (10): compilerOptions, esModuleInterop, module, moduleResolution, noEmit, skipLibCheck, strict, target (+2 more)

### Community 129 - "Community 129"
Cohesion: 0.22
Nodes (8): _item(), _price_book(), AHSPItem, ResourcePrice, Golden anchor HSP — engine UMUM vs RAB profesional NYATA (Fase 0a, brain TXT03 §, Engine UMUM harus mereproduksi HSP profesional ALFA per analisa.      Tolerans, test_engine_hsp_reproduksi_hsp_profesional(), test_semua_32_analisa_lolos_agregat()

### Community 130 - "Community 130"
Cohesion: 0.22
Nodes (7): get_current_user(), AsyncSession, BaseModel, HTTPAuthorizationCredentials, Request, RoleChecker, User

### Community 131 - "Community 131"
Cohesion: 0.20
Nodes (8): is_raster_sheet(), Deteksi sheet raster vs vektor PER SHEET (brain-00 RULE-EXT-30, Fase 2 P6).  R, Kembalikan (is_raster, n_span_vektor). >=_MIN_VECTOR_SPANS -> vektor., build_synthetic_pdf_bytes(), Fase 2 P1 — generator PDF sintetis NON-PLHUT (§0.1 fixture-bukan-template).  G, Fase 2 P6 — anchor test deteksi sheet raster vs vektor (RULE-EXT-30)., test_blank_page_detected_as_raster(), test_vector_pdf_not_detected_as_raster()

### Community 132 - "Community 132"
Cohesion: 0.20
Nodes (9): react, react, compilerOptions, jsx, lib, noEmit, display, extends (+1 more)

### Community 133 - "Community 133"
Cohesion: 0.20
Nodes (10): devDependencies, esbuild, tsx, @types/express, @types/node, @types/react, @types/react-dom, typescript (+2 more)

### Community 134 - "Community 134"
Cohesion: 0.31
Nodes (9): _build(), _load(), Golden anchor RAB TOTAL — engine UMUM merakit RAB profesional NYATA (Fase 0a-2)., Rakit price_book + ahsp_index + RABLineInput dari fixture (seperti UI/orchestrat, Engine UMUM compute_rab() harus mereproduksi grand_total RAB profesional., Subtotal 79 baris ber-AHS (HSP dari koefisien engine) ≈ subtotal ALFA (≤0.5%)., test_engine_rab_total_reproduksi_rab_profesional(), test_fixture_dkh_terisi() (+1 more)

### Community 136 - "Community 136"
Cohesion: 0.33
Nodes (7): _item(), Manual: perimeter 2*(.9+2.1)*3=18 m; area .9*2.1*3=5.67 m2; engsel 2*3=6., Manual: railing 5+7.5=12.5 m; fallback pipa 4*5=20 m., test_kusen_count_conflict_jadi_review(), test_kusen_perimeter_daun_kaca_dan_aksesoris_anchor(), test_pipa_fallback_tanpa_param_jadi_review(), test_railing_mep_points_pipe_route_dan_fallback_anchor()

### Community 137 - "Community 137"
Cohesion: 0.24
Nodes (7): get_current_user(), BaseModel, HTTPAuthorizationCredentials, Request, User, load_repo_env_local(), Load simple KEY=VALUE entries from the repo .env.local for local services.

### Community 138 - "Community 138"
Cohesion: 0.39
Nodes (7): MappingSchema, POST(), prompt(), fallbackJustification(), JustificationSchema, POST(), geminiJson()

### Community 139 - "Community 139"
Cohesion: 0.22
Nodes (8): compilerOptions, module, moduleResolution, noEmit, outDir, display, extends, $schema

### Community 140 - "Community 140"
Cohesion: 0.36
Nodes (8): _load(), _norm(), Grounding NYATA — price book Surakarta (HSD asli) memproduksi RAB PLHUT (Fase 0b, Coverage: tiap resource yang dipakai 32 analisa PLHUT punya harga Surakarta (by, Engine UMUM + price book Surakarta NYATA -> total RAB dalam ±2% (real +1,37%)., test_engine_reproduksi_rab_via_price_book_surakarta_nyata(), test_semua_komponen_plhut_terpetakan_ke_harga_surakarta(), test_surakarta_pricebook_nyata_termuat()

### Community 141 - "Community 141"
Cohesion: 0.25
Nodes (4): get_db(), AsyncSession, clean_test_database(), reset_schema()

### Community 142 - "Community 142"
Cohesion: 0.31
Nodes (8): _as_optional_float(), _build_user_prompt(), _FieldSpec, _has_keyword(), _matches_available(), _numbers_in_texts(), Any, _response_schema()

### Community 143 - "Community 143"
Cohesion: 0.22
Nodes (8): _as_optional_float(), _build_user_prompt(), has_wall_keyword(), _matches_available(), _numbers_in_texts(), Any, PAAX Document Intelligence — AI-assist slice #3: dinding pasangan bata (Fase X2, Fast filter GRATIS sebelum panggil LLM sama sekali.

### Community 144 - "Community 144"
Cohesion: 0.28
Nodes (5): OcrExtractor, Any, Normalisasi angka id-ID:         Misal: 1.000,50 -> 1000.50, SK-10 NORMALISASI ANGKA & KOREKSI OCR     Locale id-ID + kamus koreksi domain., Koreksi OCR spesifik domain arsitektur.

### Community 145 - "Community 145"
Cohesion: 0.43
Nodes (7): _load_spans(), Fase 2 P1 — anchor test ekstraksi span vektor (PDF sintetis non-PLHUT, §0.1)., test_span_id_deterministic_pattern(), test_spans_are_vector_method_full_confidence(), test_spans_have_valid_bbox_and_rotasi(), test_synthetic_fixture_has_spans(), test_synthetic_pdf_contains_expected_texts()

### Community 146 - "Community 146"
Cohesion: 0.29
Nodes (5): inter, jetbrainsMono, lora, metadata, outfit

### Community 147 - "Community 147"
Cohesion: 0.38
Nodes (5): AhspCatalogItem, createLookupAhspTool(), LookupOptions, tokens(), catalog

### Community 148 - "Community 148"
Cohesion: 0.52
Nodes (6): _ahsp(), _price(), test_ahsp_search_token_dan_unit_anchor(), test_ahsp_unit_mismatch_tidak_ok(), test_mapping_included_content_double_count_warning(), test_price_binding_missing_dan_complete_anchor()

### Community 149 - "Community 149"
Cohesion: 0.29
Nodes (7): _estimate_planned_progress(), get_deviation(), Estimasi progres rencana berdasarkan posisi hari (linear).     Ini adalah estim, Bandingkan rencana vs realisasi pada tanggal tertentu.      Alur:     1. Ambi, DeviationResult, BaseModel, Hasil perbandingan rencana-vs-realisasi deterministik.

### Community 150 - "Community 150"
Cohesion: 0.60
Nodes (5): envValue(), extractorKey(), GET(), POST(), getExtractorProviderStatus()

### Community 151 - "Community 151"
Cohesion: 0.53
Nodes (5): GET(), getPath(), POST(), proxyCoreEngine(), RouteContext

### Community 152 - "Community 152"
Cohesion: 0.53
Nodes (5): GET(), getPath(), POST(), proxyDocumentIntelligence(), RouteContext

### Community 153 - "Community 153"
Cohesion: 0.40
Nodes (5): health_check(), HealthResponse, BaseModel, Health-check endpoint for PAAX Core Engine., Return service health status.

### Community 154 - "Community 154"
Cohesion: 0.33
Nodes (5): build_placeholder_map(), Any, RABVersion, Placeholder mapping for Excel templates.  Maps template placeholders to data a, Build a dictionary of placeholder → value mappings for template filling.

### Community 155 - "Community 155"
Cohesion: 0.33
Nodes (6): dependencies, dotenv, express, @google/genai, lucide-react, react-dom

### Community 156 - "Community 156"
Cohesion: 0.47
Nodes (3): AnalyzeDrawingOptions, baseUrl(), createAnalyzeDrawingTool()

### Community 157 - "Community 157"
Cohesion: 0.60
Nodes (5): _store(), test_compute_hsp_katalog_ck_2026_fail_fast_kalau_harga_belum_ada(), test_data_coverage_setelah_import_menunjukkan_gap_harga_regional(), test_katalog_ck_2026_price_binding_jujur_banyak_missing_resources(), test_loader_memuat_sample_lama_dan_katalog_ck_2026_tanpa_collision()

### Community 158 - "Community 158"
Cohesion: 0.53
Nodes (4): _item(), Manual: WF_TEST 10 kg/m x 12 x 2 x 1.05 = 252 kg.     Built-up: 7850*.01*.2*5 =, test_baja_profile_builtup_dan_cat_anchor(), test_baja_profile_tidak_ada_jadi_review()

### Community 159 - "Community 159"
Cohesion: 0.33
Nodes (5): Config, alembic_config(), Fixture to provide Alembic configuration connected to pytest-postgresql., Test that we can upgrade to head and downgrade to base successfully., test_alembic_upgrade_and_downgrade()

### Community 161 - "Community 161"
Cohesion: 0.60
Nodes (3): BbsLike, formatTkgBbsNumber(), hasTkgBbs()

### Community 162 - "Community 162"
Cohesion: 0.70
Nodes (4): BaseModel, run_validation(), ValidationRequest, ValidationResponse

### Community 163 - "Community 163"
Cohesion: 0.40
Nodes (4): files, name, private, version

### Community 164 - "Community 164"
Cohesion: 0.40
Nodes (4): _cari_record(), TakeoffParams, TkgDocument, JOIN: cocokkan (kode, lantai); fallback kode saja bila lantai tak spesifik.

### Community 165 - "Community 165"
Cohesion: 0.40
Nodes (5): parse_rebar_raw(), Parse notasi SNI: '12D16' -> {jumlah:12, d:16} ; 'D10-150' -> {d:10, s:150}., test_parse_rebar_gagal_grammar_tidak_ditebak(), test_parse_rebar_pokok(), test_parse_rebar_sebar()

### Community 166 - "Community 166"
Cohesion: 0.50
Nodes (4): test_188_unit_gap_ahsp_diterapkan_persis_dari_laporan(), test_coverage_semarang_naik_jujur_tetap_kecil_setelah_import_25_resource(), test_semarang_price_book_repo_memuat_25_resource_dan_loader_tidak_ditimpa_overrides(), _unit_map_from_report()

### Community 167 - "Community 167"
Cohesion: 0.40
Nodes (4): Run migrations in 'offline' mode.      This configures the context with just a, Run migrations in 'online' mode.      In this scenario we need to create an En, run_migrations_offline(), run_migrations_online()

### Community 169 - "Community 169"
Cohesion: 0.60
Nodes (4): DrawingExtraction, ElementCandidate, BaseModel, RoomCandidate

### Community 170 - "Community 170"
Cohesion: 0.40
Nodes (3): BoeGenerator, Any, SK-23 ASSUMPTION / BOE GENERATOR     Mengumpulkan semua asumsi dan evidence men

### Community 171 - "Community 171"
Cohesion: 0.40
Nodes (3): GridExtractor, Any, SK-05 GRID & JARAK     Mengekstrak bentang grid dan elevasi dari teks raw.

### Community 172 - "Community 172"
Cohesion: 0.40
Nodes (3): PdfRenderer, Any, SK-01 TRIASE & SPLIT     Memecah PDF per sheet, mendeteksi apakah sheet berupa

### Community 173 - "Community 173"
Cohesion: 0.40
Nodes (3): Any, SK-04 EKSTRAKSI SCHEDULE -> TypeDict     Mengekstrak tabel schedule kolom/balok, TableExtractor

### Community 174 - "Community 174"
Cohesion: 0.40
Nodes (3): Any, SK-24 TRIAGE REVIEW & SK-25 SKORING CONFIDENCE     Memberikan prioritas review, TriageReviewer

### Community 175 - "Community 175"
Cohesion: 0.50
Nodes (3): _load_core_engine_models(), Fase 2 P1 — kontrak paritas skema TKG (mirror vs core-engine kanonik).  Memuat, test_mirror_field_names_match_core_engine()

### Community 177 - "Community 177"
Cohesion: 0.67
Nodes (3): export_excel(), ExportRequest, BaseModel

### Community 180 - "Community 180"
Cohesion: 0.50
Nodes (3): PAAX Core Engine - FastAPI Application Deterministic calculation service for RA, Log startup and initialise shared resources., startup_event()

### Community 183 - "Community 183"
Cohesion: 0.67
Nodes (3): _clean(), extract(), Ekstraktor harga satuan Surakarta dari RAB PLHUT Kankemenag Surakarta 2024 (she

### Community 186 - "Community 186"
Cohesion: 0.50
Nodes (3): process_pdf(), Any, UploadFile

### Community 187 - "Community 187"
Cohesion: 0.67
Nodes (3): BaseModel, QuantityCandidate, RabImport

### Community 188 - "Community 188"
Cohesion: 0.67
Nodes (3): normalize_typo(), Kamus ejaan/typo domain (brain-00 §2.8). Normalisasi HANYA lewat kamus resmi ini, TypoResult

### Community 189 - "Community 189"
Cohesion: 0.50
Nodes (4): Reset store — hanya untuk testing., reset_store(), clean_store(), Reset in-memory store sebelum setiap test.

### Community 193 - "Community 193"
Cohesion: 0.67
Nodes (3): paax-document-intelligence, paax-schemas, paax-core-engine

## Knowledge Gaps
- **737 isolated node(s):** `extends`, `nextConfig`, `name`, `version`, `private` (+732 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **44 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Store` connect `Community 15` to `Community 32`, `Community 27`, `Community 4`?**
  _High betweenness centrality (0.226) - this node is a cross-community bridge._
- **Why does `consolidate_document()` connect `Community 1` to `Community 35`, `Community 8`, `Community 40`, `Community 19`, `Community 182`, `Community 29`?**
  _High betweenness centrality (0.157) - this node is a cross-community bridge._
- **Why does `takeoff_tkg()` connect `Community 38` to `Community 33`, `Community 164`, `Community 69`, `Community 15`, `Community 49`, `Community 182`, `Community 120`, `Community 121`?**
  _High betweenness centrality (0.147) - this node is a cross-community bridge._
- **Are the 50 inferred relationships involving `ElementRegistryEntry` (e.g. with `ArsitekturTakeoffClient` and `BridgedArsitekturAreaLine`) actually correct?**
  _`ElementRegistryEntry` has 50 INFERRED edges - model-reasoned connections that need verification._
- **Are the 39 inferred relationships involving `consolidate_document()` (e.g. with `_perform_analysis()` and `kategori_dari_kode()`) actually correct?**
  _`consolidate_document()` has 39 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `FakeAiAssistClient` (e.g. with `GeminiAiAssistClient` and `NullAiAssistClient`) actually correct?**
  _`FakeAiAssistClient` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Are the 43 inferred relationships involving `DindingParams` (e.g. with `_Ctx` and `Aanstamping`) actually correct?**
  _`DindingParams` has 43 INFERRED edges - model-reasoned connections that need verification._