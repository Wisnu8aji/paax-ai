# PAAX Command Room Worker — Deep Testing Report

Date: 2026-08-18 (Asia/Jakarta)  
Workspace: `D:\paax-ai-command-room-worker`  
Runtime: Command Room Worker, `mimo-v2.5` via `opencode-go`  
Servers: AI Orchestrator `:8082`, web app `:3000`

## Scope and method

This run exercised the real Worker gateway and the real `/command-room` UI. API work tests used `POST /api/command-room/work`; the legacy `/api/chat` endpoint was not tested. Each API run recorded HTTP/SSE status, first event, terminal event, tool sequence, answer/error, and elapsed time. UI runs recorded DOM state and screenshots.

The worker was started from this workspace. The test process loaded the workspace copy's `.env.local` without printing secrets and supplied `PORT=8082`, `PAAX_WORKSPACE_ROOT=D:\paax-ai-command-room-worker`, `METERING_ENABLED=0`, and `PAAX_ENABLE_LEGACY_SINGLE_KEY_COMPAT=1`. The web test process used `PORT=3000` and `PAAX_GATEWAY_REQUEST_TIMEOUT_MS=120000` after the first run exposed the default 30-second timeout. Core Engine at the configured default `http://localhost:8081` was not running during the test.

Evidence files:

- API trace screenshots: `docs/ai-map/screenshots/test-01-api-evidence.png` through `test-25-api-evidence.png`.
- UI screenshots: `docs/ai-map/screenshots/test-26-page-load.png`, `test-27-*.png`, `test-28-input-submit.png`, `test-29-streaming-response.png`, `test-30-mobile-responsive.png`.
- Server output: `docs/ai-map/deep-test-orchestrator-configured.stdout.log`, `docs/ai-map/deep-test-orchestrator-configured.stderr.log`.

## Summary

**15/30 PASS, 11/30 PARTIAL, 2/30 FAIL, 2/30 BLOCKED.**

The Worker can receive real work, stream structured events, preserve sessions, protect unsupported writes behind approval, and render the main UI. It is not yet fully correct for production construction/RAB work: Core Engine was unavailable, several failed tool calls were repeated until token exhaustion, approval-gated streams hung, and the default web timeout truncated a valid long run.

## Test results

### Test 01 — Kalkulasi RAB sederhana

**Status: PARTIAL**

- **Request:** `Hitung RAB pekerjaan pondasi batu kali 60cm x 60cm untuk bangunan 10m x 8m. Harga batu kali Rp 180.000/m3, semen Rp 70.000/kg, pasir Rp 120.000/m3. Buatkan dalam format tabel.`
- **Processing:** HTTP/SSE 200; first event about 297 ms; 788 events; `lookup_ahsp` repeated 3 times; each Core Engine lookup failed because `localhost:8081` was unavailable.
- **Response:** Stream ended with a final answer in 38.587 s. The model correctly derived perimeter 36 m and volume 12.96 m³, but invented an unprovided coefficient of 200 kg cement/m³ and 0.5 m³ sand/m³, producing a manual estimate of Rp184,550,400. It explicitly warned that the semen unit looked abnormal.
- **Screenshot:** [test-01-api-evidence.png](./screenshots/test-01-api-evidence.png)
- **Bug/Error:** A construction cost answer was produced outside the deterministic Core Engine path after the authoritative lookup failed. This is not an acceptable final RAB result.
- **Timing:** 38.587 s; terminal event present.

### Test 02 — Analisa Harga Satuan Pekerjaan K-250

**Status: PARTIAL**

- **Request:** `Buat analisa harga satuan (AHS) untuk pekerjaan cor beton mutu K-250. Komposisi: semen 370 kg/m3, pasir 0.55 m3/m3, kerikil 0.85 m3/m3, water 185 liter/m3. Harga: semen Rp 70.000/kg, pasir Rp 120.000/m3, kerikil Rp 150.000/m3. Biaya tenaga kerja Rp 45.000/m3.`
- **Processing:** HTTP/SSE 200; 393 events; no tool call; model performed the arithmetic directly.
- **Response:** Final AHS in 17.328 s; calculated subtotal Rp26,138,500/m³, omitting water because no water price was supplied and noting the unusual cement unit.
- **Screenshot:** [test-02-api-evidence.png](./screenshots/test-02-api-evidence.png)
- **Bug/Error:** Numeric AHS was model-generated rather than a Core Engine receipt. The response is arithmetically plausible but not authoritative under the PAAX deterministic-number rule.
- **Timing:** 17.328 s; terminal event present.

### Test 03 — Kurva S proyek 12 bulan

**Status: PARTIAL**

- **Request:** `Buat kurva S untuk proyek pembangunan gedung 3 lantai durasi 12 bulan. Breakdown pekerjaan: struktur 40%, arsitektur 30%, MEP 20%, interior 10%. Distribusikan nilai progres per bulan.`
- **Processing:** HTTP/SSE 200; 874 events; no tool call; model chose a smooth assumed monthly distribution.
- **Response:** Incremental and cumulative table completed in 34.878 s and totaled 100%.
- **Screenshot:** [test-03-api-evidence.png](./screenshots/test-03-api-evidence.png)
- **Bug/Error:** The monthly distribution is an assumption, not a schedule receipt derived from approved quantities and durations in Core Engine.
- **Timing:** 34.878 s; terminal event present.

### Test 04 — Rekapitulasi pekerjaan

**Status: PARTIAL**

- **Request:** `1. Pekerjaan tanah - 50 m3 - Rp 45.000/m3; 2. Pondasi - 30 m3 - Rp 650.000/m3; 3. Struktur beton - 80 m3 - Rp 1.200.000/m3; 4. Pasangan bata - 200 m2 - Rp 85.000/m2. Buatkan rekapitulasi dengan total.`
- **Processing:** HTTP/SSE 200; 377 events; `todo` called 3 times; no Core Engine receipt.
- **Response:** Completed table in 19.389 s. Line totals and grand total Rp134,750,000 were correct.
- **Screenshot:** [test-04-api-evidence.png](./screenshots/test-04-api-evidence.png)
- **Bug/Error:** Correct arithmetic was presented from the model/tool loop rather than deterministic engine output.
- **Timing:** 19.389 s; terminal event present.

### Test 05 — RAB bulanan dan kurva S

**Status: PARTIAL**

- **Request:** `Proyek Rp 2.5 miliar durasi 18 bulan. Buatkan rencana anggaran biaya per bulan dengan kurva S. Bulan 1-3: 5%, 4-6: 10%, 7-9: 15%, 10-12: 20%, 13-15: 30%, 16-18: 20%.`
- **Processing:** HTTP/SSE 200; 879 events; no tool call; model expanded the six three-month bands into a monthly schedule.
- **Response:** Completed in 38.773 s. Band amounts were consistent: Rp125m, Rp250m, Rp375m, Rp500m, Rp750m, Rp500m; monthly values were rounded to the nearest thousand and cumulative total was 100%.
- **Screenshot:** [test-05-api-evidence.png](./screenshots/test-05-api-evidence.png)
- **Bug/Error:** Payment schedule is model arithmetic and rounding, not an engine receipt.
- **Timing:** 38.773 s; terminal event present.

### Test 06 — Interpretasi spesifikasi finishing

**Status: PARTIAL**

- **Request:** `Jelaskan spesifikasi teknis pekerjaan finishing: cat tembok 2 lapis plamur, 2 lapis cat dasar, 2 lapis cat penutup; granit 60x60 natural ad semen; gypsum 9mm, hollow 0.4mm, jarak 60cm. Buatkan urutan kerja dan qty estimation untuk ruangan 4m x 5m.`
- **Processing:** HTTP/SSE 200; 1,088 events; `lookup_ahsp` repeated 9 times with Core Engine unavailable.
- **Response:** Completed in 51.544 s after assuming 3 m wall height, one 0.9x2.1 m door, and one 1.2x1.2 m window. It returned a work sequence and quantities.
- **Screenshot:** [test-06-api-evidence.png](./screenshots/test-06-api-evidence.png)
- **Bug/Error:** Opening/window/height assumptions were not provided or approved; repeated failed lookup calls created avoidable latency and risk.
- **Timing:** 51.544 s; terminal event present.

### Test 07 — Kebutuhan bata ringan dan mortar

**Status: PARTIAL**

- **Request:** `Hitung kebutuhan material untuk pasangan bata ringan (hebel) dinding penyekat 4m x 3m x 12cm. Ukuran bata 60x20x10cm. mortar 1:6. Spesi 1cm.`
- **Processing:** HTTP/SSE 200; 1,278 events; no tool call.
- **Response:** Completed in 57.855 s. The model reported about 99 blocks, 0.347 m³ mortar, about 0.13 sack cement rounded to one sack, and about 0.36 m³ sand.
- **Screenshot:** [test-07-api-evidence.png](./screenshots/test-07-api-evidence.png)
- **Bug/Error:** Quantity and material conversion are model-generated, with unsourced waste/packing assumptions and no deterministic receipt.
- **Timing:** 57.855 s; terminal event present.

### Test 08 — Detail sambungan kolom-balok

**Status: PARTIAL**

- **Request:** `Buat detail sambungan kolom ke balok beton bertulang. Kolom 40x40cm, balok 30x50cm. Tulangan utama kolom 8D16, sengkang D10-150. Tulangan balok 6D12, sengkang D8-150. Jelaskan urutan pengerjaan dan anchorage.`
- **Processing:** HTTP/SSE 200; 1,354 events; no tool call; 58.3 s total.
- **Response:** Long technical explanation (9,981 characters) covering bar continuity, confinement, hooks, sequencing, and anchorage. It added assumptions such as f'c 25 MPa, fy 400 MPa, and approximately 40db anchorage, and mentioned SNI references.
- **Screenshot:** [test-08-api-evidence.png](./screenshots/test-08-api-evidence.png)
- **Bug/Error:** This is useful narrative guidance but not a stamped structural detail. Added code/design assumptions were not verified and must not be treated as construction approval.
- **Timing:** 58.300 s; terminal event present.

### Test 09 — BOQ renovasi kantor

**Status: PARTIAL**

- **Request:** `Buat BOQ untuk proyek renovasi kantor: bongkar dinding 50m2, lantai 80m2, plafond 80m2; baru dinding hebel 50m2, keramik 80m2, plafond 80m2, cat 200m2; MEP reinstall listrik 8 titik, instalasi AC 4 unit. Format No, Uraian, Qty, Satuan, Hrg Satuan, Total.`
- **Processing:** HTTP/SSE 200; 621 events; `lookup_ahsp` repeated 15 times; Core Engine unavailable.
- **Response:** Completed in 58.058 s with BOQ rows, but filled missing prices using invented/reference market ranges and added PPN totals.
- **Screenshot:** [test-09-api-evidence.png](./screenshots/test-09-api-evidence.png)
- **Bug/Error:** Missing prices should remain explicit inputs or be sourced through an approved price dataset. Model-invented market rates cannot be final BOQ values.
- **Timing:** 58.058 s; terminal event present.

### Test 10 — Scheduling renovasi 45 hari

**Status: PASS**

- **Request:** `Buat jadwal pelaksanaan untuk renovasi kantor durasi 45 hari: Minggu 1-2 bongkar dan pembersihan; Minggu 3-4 struktur dan dinding; Minggu 5-6 finishing dan MEP; Minggu 7 commissioning. Breakdown per pekerjaan dengan predecessor.`
- **Processing:** HTTP/SSE 200; 768 events; no tool call.
- **Response:** Completed in 28.548 s with A.1–D.4 work breakdown, predecessor links, milestones, and critical path. The response noted sequencing assumptions.
- **Screenshot:** [test-10-api-evidence.png](./screenshots/test-10-api-evidence.png)
- **Bug/Error:** No runtime failure. This passes as a planning draft, not as an approved baseline schedule.
- **Timing:** 28.548 s; terminal event present.

### Test 11 — Baca `package.json`

**Status: PARTIAL**

- **Request:** `Baca isi file package.json di workspace dan jelaskan dependency utama yang digunakan.`
- **Processing:** First run used the default web gateway timeout: HTTP/SSE 200, 212 events, `workspace_list` then `file_read`, stream cut at 30.362 s with `response ended prematurely` and no terminal event. After restarting the web process with `PAAX_GATEWAY_REQUEST_TIMEOUT_MS=120000`, the same real request completed with `file_read` in 22.664 s.
- **Response:** Configured rerun returned a complete dependency explanation; default configuration returned a truncated answer.
- **Screenshot:** [test-11-api-evidence.png](./screenshots/test-11-api-evidence.png)
- **Bug/Error:** Default gateway timeout is shorter than a valid worker/tool run. This test is marked PARTIAL overall even though the configured rerun passed.
- **Timing:** 30.362 s truncated first run; 22.664 s successful rerun.

### Test 12 — List dan kelompokkan source files

**Status: FAIL**

- **Request:** `List semua file di folder services/ai-orchestrator/src/ dan kelompokkan berdasarkan modul (agent, tools, gateway, state, plugins, cron, providers).`
- **Processing:** Serial run returned HTTP/SSE 200 in 41.256 s; `workspace_list` repeated 15 times, with summaries ranging from 5 to 69 entries; stream emitted `max_tokens` and no terminal answer. An earlier three-request runner attempt also surfaced a transport error.
- **Response:** No complete grouped file inventory.
- **Screenshot:** [test-12-api-evidence.png](./screenshots/test-12-api-evidence.png)
- **Bug/Error:** Over-broad listing caused repeated calls and token exhaustion. The agent needs a bounded/paginated workspace listing or a direct deterministic file-search plan.
- **Timing:** 41.256 s; no terminal event.

### Test 13 — Search `approval` in the codebase

**Status: PASS**

- **Request:** `Cari semua file yang berisi kata 'approval' di services/ai-orchestrator/src/ dan jelaskan fungsi approval di masing-masing file.`
- **Processing:** HTTP/SSE 200; `file_search` called 3 times; 416 events; search summary reported 60 matches.
- **Response:** Completed in 24.125 s and explained the key approval roles across conversation loop, memory/runtime, tool executor, turn finalizer/state, and approval flow.
- **Screenshot:** [test-13-api-evidence.png](./screenshots/test-13-api-evidence.png)
- **Bug/Error:** Minor redundant search calls; no functional failure.
- **Timing:** 24.125 s; terminal event present.

### Test 14 — Create file under `/tmp`

**Status: BLOCKED**

- **Request:** `Buat file README.md sederhana di folder /tmp/test-output/ yang berisi judul 'Test Output' dan tanggal hari ini.`
- **Processing:** HTTP/SSE 200; `terminal_run` emitted `approval.requested`; no approval decision was available through this work run. After 120.386 s the response ended prematurely without a terminal event.
- **Response:** File creation was not confirmed.
- **Screenshot:** [test-14-api-evidence.png](./screenshots/test-14-api-evidence.png)
- **Bug/Error:** The safety gate correctly stopped an outside-workspace write, but the public work stream did not resolve or terminate cleanly. Orchestrator stderr recorded `ERR_HTTP_HEADERS_SENT` at `services/ai-orchestrator/src/index.ts:380`.
- **Timing:** 120.386 s; approval wait timeout; no terminal event.

### Test 15 — Execute shell commands

**Status: BLOCKED**

- **Request:** `Jalankan command: echo hello world, lalu jalankan: date, lalu jalankan: ls -la /tmp.`
- **Processing:** HTTP/SSE 200; `terminal_run` emitted `approval.requested` because the commands were outside the read-only allowlist/scope. No approval decision was resolved.
- **Response:** No command output; stream ended prematurely after 120.142 s.
- **Screenshot:** [test-15-api-evidence.png](./screenshots/test-15-api-evidence.png)
- **Bug/Error:** Approval protection is active, but the route hangs until timeout and then attempts to write headers after the stream has already started. Same `ERR_HTTP_HEADERS_SENT` evidence as Test 14.
- **Timing:** 120.142 s; no terminal event.

### Test 16 — Context recall and budget adjustment

**Status: PASS**

- **Request sequence:** (1) `Proyek saya adalah gedung perkantoran 5 lantai di Jakarta Selatan. Budget Rp 50 miliar.` (2) `Berapa budget per lantai?` (3) `Jika ada kenaikan 10%, berapa total?`
- **Processing:** Same session `deep-test-16`; no tool calls. The three SSE runs completed in 16.361 s, 12.969 s, and 11.543 s.
- **Response:** Recalled Jakarta Selatan, 5 floors, and Rp50B; returned Rp10B/floor and Rp55B after 10% increase.
- **Screenshot:** [test-16-api-evidence.png](./screenshots/test-16-api-evidence.png)
- **Bug/Error:** Session recall works. Values are simple conversational arithmetic, not Core Engine outputs.
- **Timing:** 40.873 s combined active request time; terminal event on all three turns.

### Test 17 — Multi-tasking

**Status: PARTIAL**

- **Request:** `Saya punya 3 tugas: 1. Hitung RAB pondasi 10m x 8m; 2. Buat jadwal pelaksanaan 30 hari; 3. List semua file di workspace. Kerjakan satu per satu.`
- **Processing:** HTTP/SSE 200; 377 events; `lookup_ahsp` repeated 8 times; `workspace_list` called 3 times. Core Engine lookup failed.
- **Response:** In 21.581 s the agent reported the RAB task blocked by unavailable Core Engine, gave a schedule draft, and completed the workspace listing with 69 entries.
- **Screenshot:** [test-17-api-evidence.png](./screenshots/test-17-api-evidence.png)
- **Bug/Error:** It did not deliver the requested authoritative RAB; repeated failed lookup calls were wasteful.
- **Timing:** 21.581 s; terminal event present.

### Test 18 — Koreksi volume

**Status: PASS**

- **Request sequence:** (1) `Hitung volume balok 30x50cm panjang 6m` (2) `Salah, panjangnya 8m, hitung ulang`.
- **Processing:** Same session; no tool call. Runs completed in 11.738 s and 9.146 s.
- **Response:** First result 0.90 m³; corrected result 1.20 m³.
- **Screenshot:** [test-18-api-evidence.png](./screenshots/test-18-api-evidence.png)
- **Bug/Error:** No runtime failure; correction behavior was consistent.
- **Timing:** 20.884 s combined; terminal event on both turns.

### Test 19 — Konsistensi RAB dalam satu sesi

**Status: PASS**

- **Request sequence:** Five RAB questions covering line totals, accumulated total, percentage, an additional paint line, and explanation of the components.
- **Processing:** Same session; no tool call; request times were 12.739 s, 9.745 s, 11.580 s, 8.919 s, and 26.228 s.
- **Response:** Formatting and accumulated totals stayed consistent: 3.5m, 15.5m, 40%, 9m, and a final cumulative 28m explanation. The model also inserted an 11% PPN note in the explanation without being asked.
- **Screenshot:** [test-19-api-evidence.png](./screenshots/test-19-api-evidence.png)
- **Bug/Error:** Functional consistency passed; unsolicited tax assumptions should be marked as assumptions and not treated as project facts.
- **Timing:** 69.211 s combined; terminal event on all turns.

### Test 20 — Long context (1000+ characters)

**Status: FAIL**

- **Request:** A 1000+ character project brief including a five-floor Jakarta office, 1,200 m² land, 6,000 m² floor area, K-250, pile foundation, 18-month duration, Rp50B budget, WBS, evidence, approvals, and governance requirements.
- **Processing:** HTTP/SSE 200; 458 events; repeated `todo`, `query_rab`, and `query_schedule` calls; stream emitted `max_tokens` with no final answer.
- **Response:** No usable final response after 43.267 s.
- **Screenshot:** [test-20-api-evidence.png](./screenshots/test-20-api-evidence.png)
- **Bug/Error:** Long-context planning triggers tool churn and token exhaustion instead of bounded planning plus a graceful partial result.
- **Timing:** 43.267 s; no terminal event.

### Test 21 — Empty input

**Status: PASS**

- **Request:** Empty message body.
- **Processing:** Request validation rejected it before model execution.
- **Response:** HTTP 400 in 288 ms: `Work request tidak valid`; schema detail stated that messages must contain at least one character.
- **Screenshot:** [test-21-api-evidence.png](./screenshots/test-21-api-evidence.png)
- **Bug/Error:** No crash; graceful validation.
- **Timing:** 288 ms.

### Test 22 — Invalid/gibberish input

**Status: PASS**

- **Request:** `asdkjfhaskjdfhaskjdfh`
- **Processing:** HTTP/SSE 200; 260 events; `workspace_list` called 3 times.
- **Response:** In 15.865 s the agent asked for clarification and offered help instead of crashing.
- **Screenshot:** [test-22-api-evidence.png](./screenshots/test-22-api-evidence.png)
- **Bug/Error:** Minor unnecessary workspace-list activity for a nonsensical prompt.
- **Timing:** 15.865 s; terminal event present.

### Test 23 — 10,000-character request

**Status: PASS**

- **Request:** A 10,000-character payload of `X` characters.
- **Processing:** HTTP/SSE 200; 117 events; no tool call.
- **Response:** In 7.059 s the agent returned a clarification/help response without a crash or protocol error.
- **Screenshot:** [test-23-api-evidence.png](./screenshots/test-23-api-evidence.png)
- **Bug/Error:** No runtime failure observed. The response did not attempt to process the meaningless payload, which is appropriate.
- **Timing:** 7.059 s; terminal event present.

### Test 24 — Three concurrent requests

**Status: PASS**

- **Requests:** Three simultaneous work turns: volume `2m x 3m x 4m`; a three-line RAB list; and a seven-day schedule.
- **Processing:** All three returned HTTP/SSE 200 and terminal events. Tool repetitions were visible in the schedule request (`query_rab`, `query_schedule`, and `lookup_ahsp`).
- **Response:** Volume completed in 7.944 s with 24 m³; RAB response in 11.835 s; schedule response in 21.786 s. No process crash.
- **Screenshot:** [test-24-api-evidence.png](./screenshots/test-24-api-evidence.png)
- **Bug/Error:** Concurrency held, but tool retry behavior remained noisy and should be bounded.
- **Timing:** 7.944 s / 11.835 s / 21.786 s per request.

### Test 25 — Five-minute idle session

**Status: PASS**

- **Request sequence:** (1) `Simpan konteks: proyek renovasi kantor 45 hari di Jakarta.` (2) after exactly five minutes without activity: `Apa durasi dan lokasi proyek yang saya sebutkan?`
- **Processing:** Same session `deep-test-25`; first run used `workspace_list` and `todo` 3 times; idle wait was 300 seconds; recall run used no tools.
- **Response:** First run completed in 30.688 s; second completed in 7.309 s and recalled 45 days/Jakarta.
- **Screenshot:** [test-25-api-evidence.png](./screenshots/test-25-api-evidence.png)
- **Bug/Error:** Session survived the idle interval.
- **Timing:** 30.688 s, 300 s idle, 7.309 s recall.

### Test 26 — Page load

**Status: PASS**

- **Request:** Open `http://localhost:3000/command-room`.
- **Processing:** Browser page returned HTTP 200; DOM contained the PAAX shell, navigation rail, Chat/Work tabs, model control, prompt composer, and project controls.
- **Response/UI:** No blank page or visible crash. The default Chat surface rendered `Hello World!`, `What are we solving?`, and the composer.
- **Screenshot:** [test-26-page-load.png](./screenshots/test-26-page-load.png)
- **Bug/Error:** No page-load failure observed.
- **Timing:** Page load observed successfully; exact browser timing was not captured.

### Test 27 — Tab navigation

**Status: PASS**

- **Request:** Clicked Project, Home, Chat, and Work navigation/mode controls.
- **Processing:** Each state changed in the DOM. Work view exposed sessions, SSE/replay, task ledger, `Instruksi kerja`, and settings.
- **Response/UI:** All tested tabs were interactive and rendered content; no blank panel or navigation crash.
- **Screenshots:** [test-27-project.png](./screenshots/test-27-project.png), [test-27-home.png](./screenshots/test-27-home.png), [test-27-chat.png](./screenshots/test-27-chat.png), [test-27-work.png](./screenshots/test-27-work.png)
- **Bug/Error:** No functional UI failure observed.
- **Timing:** Each navigation completed within the browser interaction window; exact timings not captured.

### Test 28 — Input and submit

**Status: PASS**

- **Request:** Typed and submitted `Hitung volume balok 2m x 3m x 4m dan jelaskan singkat.` in Chat.
- **Processing:** DOM showed the user message, PAAX Lucent activity state, `Hentikan proses`, disabled composer during execution, then re-enabled composer after completion.
- **Response/UI:** Final UI rendered 24 m³ with a short explanation and timeline.
- **Screenshot:** [test-28-input-submit.png](./screenshots/test-28-input-submit.png)
- **Bug/Error:** No submit/render failure.
- **Timing:** First in-flight screenshot at about 1.2 s; terminal UI state observed after about 30 s.

### Test 29 — Streaming response

**Status: PASS**

- **Request:** `Buatkan tabel rekapitulasi RAB untuk pekerjaan tanah 50 m3 x Rp 45.000, pondasi 30 m3 x Rp 650.000, dan struktur beton 80 m3 x Rp 1.200.000.`
- **Processing:** At 2.5 s the UI showed the user prompt, PAAX activity timeline, and disabled composer while `inFlight=true`. Later DOM showed the rendered table and completed timeline.
- **Response/UI:** Streaming surfaced progressively and ended without a browser crash. Because Core Engine was offline, the claim guard rendered `[klaim ditolak]` and `7 klaim ditahan` instead of displaying an unverified final total.
- **Screenshot:** [test-29-streaming-response.png](./screenshots/test-29-streaming-response.png)
- **Bug/Error:** The claim guard behaved safely, but the user-facing recovery path should explain how to reconnect/retry Core Engine rather than leaving a rejected result as the apparent conclusion.
- **Timing:** First streaming screenshot at about 2.5 s; completed UI observed after about 35 s.

### Test 30 — Mobile responsive layout

**Status: PASS**

- **Request:** Browser viewport set to 390x844, then `/command-room` reloaded.
- **Processing:** DOM still exposed Chat/Work controls, prompt textbox, model selector, and submit control at the mobile viewport.
- **Response/UI:** Narrow layout rendered without a blank page or horizontal interaction failure; left navigation and composer remained visible.
- **Screenshot:** [test-30-mobile-responsive.png](./screenshots/test-30-mobile-responsive.png)
- **Bug/Error:** No critical mobile failure observed in this viewport.
- **Timing:** Responsive reload completed; exact browser timing not captured.

## Bug list

### B-01 — Core Engine unavailable for authoritative quantities and costs — HIGH

`CORE_ENGINE_URL` resolved to the default `http://localhost:8081`, but no Core Engine was started. `lookup_ahsp` failed in Tests 01, 06, 09, and 17; the same missing authority affected the construction-numeric tests and the UI claim pipeline in Test 29. The agent then produced manual numbers or reference prices in several cases. The Worker must fail closed for final RAB/HSP/quantity/duration values and show a recoverable engine-unavailable state.

### B-02 — Repeated failed or redundant tool calls — HIGH

The same tool was retried repeatedly: `lookup_ahsp` x3/x9/x15, `workspace_list` x15, and repeated `todo`/query calls. Tests 12 and 20 ended with `max_tokens` and no final answer. Add identical-failure detection, bounded retries, pagination, and a tool-loop budget that produces a terminal partial result.

### B-03 — Approval-gated stream hangs and writes headers twice — HIGH

Tests 14 and 15 emitted `approval.requested`, waited about 120 seconds, and ended without a terminal event. The orchestrator stderr contains `ERR_HTTP_HEADERS_SENT` twice at `services/ai-orchestrator/src/index.ts:380`; the generic Express error handler calls `res.status(500).json(...)` after the SSE response has begun. The stream needs an explicit pending-approval lifecycle, a resolvable approval endpoint for this route, a terminal timeout/error event, and an error handler that checks `res.headersSent`.

### B-04 — Default web gateway timeout truncates valid work — HIGH

`apps/web/src/app/api/command-room/work/gateway-client.ts:13-30` defaults to 30,000 ms. Test 11 was truncated at 30.362 s; the same request completed in 22.664 s after setting `PAAX_GATEWAY_REQUEST_TIMEOUT_MS=120000`. The default must be aligned with the worker gateway's real bounded execution time, with clear timeout SSE/error handling.

### B-05 — Launch environment is not self-consistent — MEDIUM

A bare worker launch did not inherit the web app's intended runtime settings: the web proxy initially returned 401, and workspace tools lacked a root until the test process supplied `PAAX_WORKSPACE_ROOT`. The test required legacy single-key compatibility to run. Production startup should use the intended service-identity registry and an explicit worker/web environment contract; legacy compatibility should not be the normal deployment fix.

### B-06 — Long-context execution has no graceful degradation — MEDIUM

Test 20 passed a valid project brief but tool planning churned until `max_tokens`. The planner needs early task decomposition, bounded context/tool summaries, and a final response that states which subtasks completed and which are pending.

### B-07 — Missing-input assumptions leak into construction outputs — MEDIUM/HIGH

Tests 01, 06, 07, 08, and 09 introduced coefficients, geometry, structural material assumptions, waste/conversion factors, or market prices that were not supplied. The UI should distinguish proposal/assumption from approved fact, and all final quantities/costs should remain blocked until facts and engine calculation are approved.

### B-08 — Safe claim rejection needs recovery UX — MEDIUM

Test 29 proved the UI claim guard refused an unverified total, which is correct. It should also expose a clear “Core Engine unavailable — retry after service recovery” action/status so the user knows how to finish the task.

## Recommendations

1. Start and health-check the Core Engine as part of the Command Room Worker test/deployment harness, then rerun Tests 01–09, 17, 20, and 29.
2. Make the gateway fail closed for deterministic construction numbers when Core Engine is unavailable; never substitute LLM arithmetic or invented market rates as final values.
3. Add retry budgets keyed by tool plus normalized arguments; stop on identical errors, paginate large workspace results, and always emit `turn.completed` or `turn.failed`.
4. Repair approval streaming end-to-end: keep the stream open only while a known approval is pending, route the approval decision to the same session/run, emit `approval.resolved` and a terminal event, and guard the Express error handler with `res.headersSent`.
5. Align the web timeout default with the worker's bounded 120-second gateway or make the timeout a documented deployment requirement with a visible timeout state.
6. Add automated E2E coverage for tool failure, max-token exhaustion, approval resolution/timeout, concurrent requests, and UI claim rejection/retry.
7. Keep construction-domain narrative answers clearly labeled as draft guidance and require approved facts plus Core Engine receipts for RAB, HSP, BOQ amounts, quantities, and schedule numbers.

## Conclusion

The AI agent is operational but **not yet functioning correctly as a production-ready PAAX construction authority**. The core chat/session/UI path is real and usable, including streaming, concurrent requests, context recall, correction, graceful validation, approval protection, and mobile rendering. However, the two authoritative dependencies and several failure paths are not production-safe: deterministic numeric work cannot complete without Core Engine, tool loops can exhaust tokens, approval streams can hang and trigger a headers-sent error, and the default web timeout can truncate valid work. The correct release decision is **do not sign off yet; fix B-01 through B-04 and rerun the blocked/partial cases**.

No commit, push, branch, or merge was performed. `D:\paax-ai-main` was not touched.
