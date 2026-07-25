# Hasil riset mendalam: Kreo, AI Takeoff, dan teknologi deteksi gambar kerja

## Kesimpulan utama

Kreo tidak bekerja seperti satu model vision yang menerima satu lembar gambar lalu langsung “memahami bangunan”. Sistemnya lebih masuk akal dipandang sebagai **pipeline multimodal bertingkat**:

1. Membaca struktur file dan halaman.
2. Memisahkan zona gambar, legenda, tabel, catatan, dan title block.
3. Mengekstrak teks serta geometri.
4. Menjalankan model khusus untuk area, garis, simbol, ruang, dinding, pintu, dan objek berulang.
5. Menghubungkan tag pada denah dengan legenda atau schedule.
6. Mengubah hasil deteksi menjadi geometri terukur.
7. Meminta manusia memvalidasi hasil yang confidence-nya rendah.
8. Menggunakan agent/LLM untuk merencanakan dan mengoperasikan alat-alat tersebut.

Kreo sendiri menyebut pendekatan terbarunya sebagai **agentic computer vision**. Dalam Kreo 6.0, sistem memetakan zona halaman, membaca konteks lintas gambar, memahami legenda dan tabel, serta menjalankan pengukuran melalui sejumlah AI tools. ([Kreo Software][1])

Namun, **Kreo tidak memublikasikan model, arsitektur neural network, dataset pelatihan, atau source code internalnya**. Jadi penjelasan teknis di bawah dibagi menjadi:

* hal yang dikonfirmasi oleh dokumentasi Kreo;
* inferensi teknis berdasarkan perilaku produknya;
* teknologi open-source yang paling dekat dengan perilaku tersebut.

---

# 1. Apa sebenarnya Kreo saat ini?

Kreo terbaru bukan sekadar aplikasi digital takeoff. Platformnya sudah bergerak menjadi kombinasi:

* drawing intelligence;
* computer vision;
* document intelligence;
* measurement engine;
* semantic search;
* workflow agent.

Kreo dapat menerima PDF, gambar raster, dan format CAD tertentu. Dokumentasinya menyatakan bahwa ketika tersedia, sistem memanfaatkan **data vektor asli PDF/CAD**, bukan sekadar melihat hasil render sebagai gambar. Ini sangat penting karena garis, kurva, polygon, teks, dan koordinat dapat dibaca dengan presisi yang jauh lebih tinggi dibandingkan hanya menggunakan model vision terhadap screenshot. ([Kreo Help][2])

Fitur utamanya saat ini mencakup:

| Lapisan            | Fitur Kreo                                        |
| ------------------ | ------------------------------------------------- |
| Struktur dokumen   | Smart Page Layout, Plan Zones                     |
| Teks               | Text Search, Smart Labels, table extraction       |
| Geometri area      | One-Click Area, Find Similar                      |
| Geometri linear    | One-Click Line                                    |
| Objek berulang     | Auto Count                                        |
| Elemen arsitektur  | Auto Measure                                      |
| Relasi antargambar | Cross Reference                                   |
| Agent              | Caddie                                            |
| Validasi           | confidence slider, Fix with AI, review candidates |

Artinya, keunggulan Kreo kemungkinan tidak terletak pada satu “model AI super”, tetapi pada integrasi banyak model kecil dan aturan geometri yang dikoordinasikan dalam satu workflow.

---

# 2. Bagaimana Kreo kemungkinan membaca gambar kerja?

## Tahap A — Modality routing

Pertama, sistem perlu mengetahui jenis input:

* PDF vektor;
* PDF hasil scan;
* gambar raster;
* file CAD;
* halaman campuran raster dan vektor.

Untuk PDF vektor, sistem dapat membaca:

* line;
* polyline;
* Bézier curve;
* polygon;
* hatch;
* text object;
* clipping path;
* layer;
* transformation matrix;
* posisi dan bounding box.

Untuk PDF scan, semua informasi itu hilang. Sistem hanya menerima pixel, sehingga harus menggunakan OCR, segmentasi, object detection, line detection, dan rekonstruksi geometri.

Arsitektur terbaik adalah **vector-first, raster-fallback**:

```text
File masuk
   │
   ├── Ada primitive vektor?
   │       ├── Ya → ekstrak primitive, teks, layer, koordinat
   │       └── Tidak → render halaman dan jalankan computer vision
   │
   └── Gabungkan hasil vektor + raster ke koordinat halaman yang sama
```

Ini menjelaskan mengapa kualitas takeoff biasanya lebih baik pada PDF yang diekspor langsung dari AutoCAD/Revit dibandingkan scan atau screenshot.

---

## Tahap B — Memetakan zona halaman

Sebelum mendeteksi dinding atau menghitung simbol, halaman perlu dipisahkan menjadi beberapa zona:

* drawing;
* title block;
* legend;
* schedule/table;
* notes;
* stamp;
* detail callout.

Kreo memiliki Plan Zones dan Smart Page Layout yang mengidentifikasi kategori tersebut. Zona ini kemudian digunakan untuk membatasi pencarian dan menghindari kesalahan, misalnya simbol pintu pada legenda ikut dihitung sebagai pintu aktual pada denah. ([Kreo Help][3])

Teknologi open-source yang relevan adalah **DocLayout-YOLO**, PaddleOCR PP-Structure, Surya, dan deepdoctection. DocLayout-YOLO, misalnya, menggunakan object detector berbasis keluarga YOLO untuk menemukan wilayah seperti tabel, judul, teks, dan gambar pada dokumen. ([GitHub][4])

Secara teknis:

```text
Page image
   ↓
Layout detector
   ↓
[
  {type: "drawing", bbox: [...]},
  {type: "legend", bbox: [...]},
  {type: "table", bbox: [...]},
  {type: "title_block", bbox: [...]}
]
```

Inilah salah satu fondasi paling penting. VLM yang langsung membaca seluruh halaman tanpa pemisahan zona akan mencampur antara:

* objek aktual;
* contoh simbol pada legenda;
* catatan;
* detail;
* tabel;
* informasi title block.

---

## Tahap C — Teks, tabel, dan semantic labels

Kreo memiliki:

* Text Search;
* Extract Tables;
* Smart Labels;
* Cross Reference.

Smart Labels tidak hanya mencari teks identik, tetapi mengelompokkan label berdasarkan makna. Dokumentasinya memberikan contoh pengenalan istilah yang berbeda tetapi bermakna serupa, serta pemisahan kode seperti W1, W2, dan W3. ([Kreo Help][5])

Pipeline yang mungkin digunakan:

```text
Native PDF text / OCR
        ↓
Text boxes + coordinates
        ↓
Normalization
- uppercase/lowercase
- punctuation
- OCR correction
- abbreviation expansion
        ↓
Semantic embedding
        ↓
Clustering / entity classification
```

Contohnya:

```text
"PWR SKT"
"POWER SOCKET"
"PWR. SCKT."
"SOCKET OUTLET"
```

Semua dapat diarahkan ke entity yang sama:

```json
{
  "entity_type": "electrical_fixture",
  "canonical_name": "power_socket"
}
```

Untuk engineering drawing, generic OCR biasanya tidak cukup. Karakter seperti berikut sering bermasalah:

* Ø;
* ±;
* Δ;
* simbol welding;
* superscript;
* fraction;
* dimensi berantai;
* GD&T;
* kode grid;
* simbol detail.

Repository **eDOCr** secara khusus memisahkan title/information block, dimensi, dan simbol engineering sebelum menjalankan OCR khusus. Pendekatan seperti ini jauh lebih masuk akal daripada menjalankan OCR umum terhadap seluruh halaman. ([GitHub][6])

---

# 3. Bagaimana One-Click Area bekerja?

Kreo One-Click Area memungkinkan pengguna:

* mengklik bagian dalam area;
* menambahkan positive point;
* menambahkan negative point;
* membatasi wilayah kerja;
* mengklasifikasikan area dari teks, legenda, dan appearance.

Positive point mengatakan:

> “Bagian ini termasuk objek.”

Negative point mengatakan:

> “Bagian ini bukan objek.”

Fungsinya sangat mirip dengan **promptable segmentation**, seperti Segment Anything Model atau SAM, walaupun tidak ada bukti Kreo benar-benar menggunakan SAM. ([Kreo Help][7])

Kemungkinan prosesnya:

```text
User click
   ↓
Ambil local crop di sekitar titik
   ↓
Gabungkan fitur:
- pixel
- edge
- vector lines
- hatch
- nearby text
   ↓
Promptable mask prediction
   ↓
Boundary snapping ke garis vektor terdekat
   ↓
Polygon cleaning
   ↓
Area calculation
```

Mask hasil neural network tidak boleh langsung digunakan untuk quantity final. Boundary-nya perlu:

* disederhanakan;
* ditutup;
* di-snap ke garis terdekat;
* dibuang self-intersection-nya;
* dikoreksi terhadap opening atau void;
* dikonversi ke koordinat dunia nyata.

Secara konseptual:

```text
AI menghasilkan dugaan wilayah
Geometry engine menghasilkan polygon final
```

Ini merupakan prinsip penting: **AI menemukan lokasi; mesin geometri menghitung kuantitas.**

Kreo juga menggunakan teks di dalam polygon, referensi legenda, dan visual appearance untuk memberi nama atau klasifikasi area secara otomatis. ([Kreo Help][7])

---

# 4. Bagaimana Auto Count mendeteksi simbol?

Auto Count Kreo bekerja berdasarkan reference object. Pengguna:

1. memilih contoh objek;
2. membersihkan clutter dari template;
3. memilih apakah rotation atau mirror diperbolehkan;
4. membatasi search area;
5. menjalankan pencarian;
6. memeriksa candidate berdasarkan similarity score;
7. menaikkan atau menurunkan confidence threshold.

Kreo dapat mencari objek geometris maupun teks, mendukung rotasi dan flipping, serta menampilkan kandidat berdasarkan persentase kemiripan. ([Kreo Help][8])

Ini kemungkinan bukan object detector klasikal yang telah dilatih untuk semua simbol konstruksi. Perilakunya lebih dekat dengan kombinasi:

* template matching;
* geometric descriptor;
* image embedding;
* metric learning;
* approximate nearest-neighbor search;
* candidate re-ranking.

Pipeline yang masuk akal:

```text
Reference symbol
   ↓
Crop dan bersihkan background
   ↓
Normalisasi skala/orientasi
   ↓
Hitung descriptor:
- visual embedding
- contour signature
- line-angle histogram
- topology
- aspect ratio
- nearby text
   ↓
Cari kandidat di seluruh sheet
   ↓
Similarity scoring
   ↓
Non-maximum suppression
   ↓
Human validation
```

Visual embedding dapat menggunakan model seperti DINOv2. Model tersebut menghasilkan representasi fitur yang relatif kuat untuk image similarity tanpa harus melatih classifier baru untuk setiap objek. ([GitHub][9])

Tetapi pada construction drawing, embedding gambar saja belum cukup. Dua simbol dapat terlihat serupa tetapi memiliki arti berbeda. Karena itu descriptor ideal perlu mencakup:

```text
Visual shape
+ line topology
+ ukuran relatif
+ orientasi
+ teks terdekat
+ halaman/disiplin
+ definisi legenda
```

---

# 5. Temuan sangat relevan dari deteksi simbol P&ID

Salah satu repository paling relevan bukan berasal dari architectural takeoff, tetapi dari **Piping and Instrumentation Diagram**:

## PID Symbol Detection

Repository ini menggunakan pendekatan dua tahap:

1. **Class-agnostic detector** mendeteksi wilayah yang tampak sebagai simbol tanpa harus langsung mengetahui kelasnya.
2. **Few-shot atau one-shot classifier** membandingkan simbol tersebut dengan satu atau beberapa contoh dari legenda.

Untuk drawing berukuran sangat besar, halaman dibagi menjadi overlapping patches, lalu hasil deteksi digabungkan menggunakan pendekatan seperti SAHI. ([GitHub][10])

Arsitekturnya sangat relevan untuk PAAX:

```text
Gambar proyek
   ↓
Deteksi semua kandidat simbol
   ↓
Ambil contoh simbol dari legenda proyek
   ↓
Bangun prototype embedding per simbol
   ↓
Bandingkan kandidat dengan prototype
   ↓
Klasifikasikan:
- column K1
- column K2
- door D1
- lamp L1
- socket S1
```

Ini lebih realistis daripada membuat model universal yang harus mengenali seluruh simbol konstruksi di dunia.

Setiap konsultan memiliki:

* simbol berbeda;
* lineweight berbeda;
* penamaan berbeda;
* template berbeda;
* gaya legenda berbeda.

Karena itu, pendekatan yang paling kuat adalah:

> **Model belajar konteks proyek dari legend dan contoh yang tersedia pada proyek tersebut.**

Bukan:

> Model dipaksa mengetahui seluruh jenis simbol dari pelatihan awal.

Ini salah satu temuan paling bernilai dari riset ini.

---

# 6. Bagaimana Find Similar kemungkinan bekerja?

Kreo Find Similar menggunakan satu atau beberapa polygon yang sudah dipilih sebagai reference. Sistem kemudian mencari area serupa dan menyediakan:

* confidence slider;
* mode pencarian dari cepat sampai detail;
* feedback negatif;
* Fix with AI;
* penggunaan beberapa contoh reference.

Dokumentasinya menyatakan fungsi tersebut dapat bekerja tanpa training tambahan dari pengguna. ([Kreo Help][11])

Mekanismenya kemungkinan:

```text
Reference polygons
   ↓
Extract local features:
- hatch
- texture
- color
- line density
- shape
- neighboring labels
   ↓
Create prototype embedding
   ↓
Retrieve candidate regions
   ↓
Segment candidate
   ↓
Rank by similarity
```

Ketika pengguna menolak sebuah hasil, contoh tersebut menjadi **hard negative**:

```text
Positive examples:
- polygon lantai keramik yang benar

Negative examples:
- hatch serupa di legenda
- hatch pada detail potongan
- area yang bukan lantai
```

Sistem kemudian melakukan re-ranking tanpa harus melatih ulang model besar.

Ini merupakan pola **interactive learning**, bukan full autonomous detection.

---

# 7. Bagaimana Auto Measure mendeteksi denah?

Auto Measure Kreo dapat mengenali dan mengklasifikasikan:

* wall;
* door;
* window;
* room;
* stair;
* beberapa jenis measurement;
* ruang seperti bedroom atau living room.

Dokumentasi Kreo sendiri menyatakan bahwa Auto Measure paling cocok untuk architectural floor plan, terutama residential. Structural plan dapat menghasilkan hasil yang berantakan atau tidak akurat dan tetap harus diperiksa pengguna. ([Kreo Help][12])

Versi terbarunya juga dapat mengelompokkan dinding berdasarkan:

* ukuran;
* ketebalan;
* appearance;
* hatching.

Selain itu tersedia confidence control dan Fix with AI. ([Kreo Help][13])

## Kemungkinan arsitektur Auto Measure

Auto Measure kemungkinan menggunakan model multi-task:

```text
Input drawing
   ↓
Shared feature encoder
   ├── wall segmentation head
   ├── door/window detection head
   ├── room segmentation head
   ├── room-type classification head
   ├── junction detection head
   └── text association head
```

Setelah prediksi:

```text
Masks dan detections
   ↓
Vectorization
   ↓
Endpoint snapping
   ↓
Wall centerline / wall face reconstruction
   ↓
Door-window insertion
   ↓
Closed room graph
   ↓
Room polygon
   ↓
Measurement
```

Repository yang paling relevan:

### CubiCasa5K

CubiCasa5K menyediakan 5.000 denah dengan lebih dari 80 kategori objek dan anotasi polygon. Modelnya menjalankan beberapa task sekaligus, termasuk semantic segmentation dan prediksi junction. ([GitHub][14])

### DeepFloorplan

DeepFloorplan menggunakan multi-task learning dengan room-boundary-guided attention untuk mempelajari:

* dinding;
* pintu;
* jendela;
* tipe ruang.

Repository dan stack-nya sudah cukup lama, tetapi konsep modelnya masih relevan. ([GitHub][15])

### Raster-to-Graph

Raster-to-Graph tidak berhenti pada mask pixel. Sistem mengubah denah menjadi **structural graph**, dengan wall junction dan wall segment sebagai node dan edge. Pendekatan graph jauh lebih cocok untuk rekonstruksi bangunan karena hubungan antarobjek sama pentingnya dengan bentuk visualnya. ([GitHub][16])

Inilah perbedaan antara:

```text
“Ini pixel dinding”
```

dan:

```text
“Dinding A terhubung dengan dinding B,
membentuk ruang R2,
memiliki opening pintu D1,
dan berada pada grid 3–4/A–B.”
```

Untuk PAAX, hasil kedua jauh lebih bernilai.

---

# 8. Bagaimana One-Click Line kemungkinan bekerja?

One-Click Line Kreo menggunakan titik yang dipilih pengguna untuk mengikuti objek linear. Posisi klik di sisi atau bagian dalam objek dapat memengaruhi hasil. Sistem juga dapat mencari jalur terpendek dan menggunakan negative point untuk membuang bagian yang salah. ([Kreo Help][17])

Secara teknis:

```text
Local line segmentation
   ↓
Skeletonization
   ↓
Convert skeleton to graph
   ↓
Nodes:
- endpoints
- intersections
- corners

Edges:
- line segments
   ↓
Shortest-path / constrained-path search
   ↓
Polyline reconstruction
```

Teknologi yang sangat relevan adalah road-network extraction.

### SAM-Road

SAM-Road menggabungkan kemampuan segmentasi dengan ekstraksi graph jaringan jalan. Target akhirnya bukan hanya mask jalan, tetapi struktur jaringan yang memiliki konektivitas. ([GitHub][18])

### Road connectivity learning

Penelitian lain menambahkan objective khusus untuk konektivitas, karena pixel accuracy yang tinggi belum tentu menghasilkan jaringan yang tersambung. ([GitHub][19])

Konsep yang sama berlaku untuk:

* pipe;
* duct;
* cable;
* wall centerline;
* kerb;
* reinforcement line;
* grid;
* plumbing route.

Model dapat memiliki IoU tinggi tetapi tetap gagal total jika ada gap kecil yang memutus koneksi.

Karena itu, untuk line takeoff, metrik seperti IoU tidak cukup. Diperlukan:

* endpoint accuracy;
* connectivity recall;
* path completeness;
* junction accuracy;
* total-length error.

---

# 9. Bagaimana Kreo menghubungkan denah dengan legenda?

Kreo Cross Reference menghubungkan tag yang ditemukan pada denah dengan definisinya pada:

* legend;
* schedule;
* tabel;
* halaman lain.

Pengguna dapat berpindah dari tag ke sumber definisinya dan menghitung seluruh tag yang sama. ([Kreo Help][20])

Kemungkinan representasinya adalah graph:

```text
Node:
- sheet
- drawing zone
- object
- text tag
- legend entry
- schedule row
- measurement

Edge:
- appears_on
- defined_by
- references
- belongs_to
- measured_as
- same_type_as
```

Contoh:

```text
Object Column-023
   ├── appears_on → Structural Plan Level 2
   ├── tagged_as → K1
   ├── defined_by → Column Schedule Row K1
   ├── material → Concrete 30 MPa
   ├── dimension → 400 × 400 mm
   └── belongs_to → Level 2
```

Ini sangat dekat dengan arah PAAX menggunakan Graphify, tetapi graph-nya tidak boleh hanya berasal dari rangkuman LLM. Graph harus dibangun dari:

* koordinat;
* halaman;
* bbox;
* geometric object;
* text entity;
* source evidence;
* relationship confidence.

Setiap relasi harus memiliki provenance:

```json
{
  "relationship": "defined_by",
  "source_object": "column-023",
  "target_object": "column-schedule-K1",
  "evidence": {
    "plan_page": 27,
    "plan_bbox": [412, 220, 451, 267],
    "schedule_page": 8,
    "schedule_row": 4
  },
  "confidence": 0.94
}
```

Tanpa provenance, sistem akan sulit diperiksa ketika jawabannya salah.

---

# 10. Apa fungsi Caddie dan agentic AI?

Caddie adalah lapisan agent yang memungkinkan pengguna meminta sistem:

* mencari informasi;
* membaca halaman;
* membuat measurement;
* menghitung objek;
* mengekstrak scope;
* mengoperasikan tool Kreo.

Kreo menggambarkannya sebagai autonomous agent yang membaca drawing, menjalankan measurement, dan memberikan quantity. Dokumentasi tertentu juga menyebut penggunaan ChatGPT dalam fungsi tanya jawab dokumen. ([Kreo Software][21])

Tetapi agent tidak seharusnya menjadi mesin ukur utama.

Arsitektur yang benar:

```text
User:
“Hitung seluruh kolom K1 di lantai dua.”

LLM/Agent:
1. Cari sheet structural floor plan level 2.
2. Cari legend atau schedule kolom.
3. Resolusi definisi K1.
4. Jalankan symbol detector pada drawing zone.
5. Hilangkan simbol pada legend/title block.
6. Validasi setiap kandidat.
7. Hitung dan tampilkan bukti.
```

Bukan:

```text
LLM melihat gambar lalu menjawab “terdapat 14 kolom.”
```

LLM berfungsi sebagai:

* planner;
* query interpreter;
* tool selector;
* result synthesizer.

Sementara koordinat dan quantity harus berasal dari:

* detector;
* OCR;
* graph;
* geometry engine;
* database hasil ekstraksi.

Ada sedikit ketidakkonsistenan pada dokumentasi Kreo: materi Kreo 6.0 menekankan konteks lintas halaman, sementara halaman bantuan tertentu masih menggambarkan percakapan yang bekerja per halaman. Ini kemungkinan menunjukkan transisi produk atau perbedaan antara workflow/versi fitur, sehingga kemampuan lintas halaman tidak boleh diasumsikan selalu sama pada seluruh akun atau seluruh tool. ([Kreo Software][1])

---

# 11. Apa kata pengguna Reddit dan komunitas estimator?

Pola dari diskusi estimator cukup konsisten: AI takeoff saat ini lebih berguna sebagai **copilot**, bukan pengganti estimator.

## Hal yang dinilai cukup berguna

Pengguna melaporkan nilai pada:

* page naming;
* keyword search;
* mencari simbol berulang;
* fixture dan lighting count;
* preliminary atau ROM estimate;
* repetitive floor plan;
* area interior finish tertentu.

Salah satu pengguna Togal mengatakan automated takeoff masih terlalu kasar untuk pekerjaan Divisi 9, tetapi pencarian halaman, pencarian gambar serupa, dan counting tetap memberikan manfaat. Pengguna lain mengatakan hasil pencarian simbol hanya sekitar 30% pada kasus mereka sehingga koreksinya lebih berat daripada menghitung manual. ([Reddit][22])

## Area yang paling sering bermasalah

* HVAC dan MEP;
* civil/sitework;
* drawing yang belum final;
* linework kompleks;
* plan dengan skala tidak konsisten;
* scan berkualitas buruk;
* infill wall dan fur-out;
* pekerjaan yang membutuhkan interpretasi notes dan precedence lintas disiplin.

Pengguna Reddit juga menekankan bahwa kualitas PDF, simbol, lineweight, dan jenis disiplin sangat memengaruhi hasil. Beberapa perusahaan mencoba beberapa platform tetapi kembali ke workflow Bluebeam atau Procore karena hasil otomatis belum memenuhi tingkat kepercayaan mereka. ([Reddit][23])

Komentar yang paling tajam datang dari estimator civil/sitework: kesulitan terbesar bukan sekadar menggambar polygon, tetapi memahami ratusan halaman, konflik antardisiplin, notes, legenda, scale, pekerjaan lapangan, equipment, hauling, dan kondisi proyek. Satu objek yang terlewat dapat mengubah hasil bid secara material. ([Reddit][24])

Kesimpulan komunitas secara umum:

```text
AI takeoff hari ini:
baik untuk mempercepat kerja repetitif,
belum cukup kuat untuk mengambil tanggung jawab final estimator.
```

Model kerja yang realistis lebih mendekati:

```text
AI menghasilkan kandidat 70%
Manusia memeriksa, mengoreksi, dan menyelesaikan 30%
```

Bukan full automation tanpa review. Diskusi komunitas juga menunjukkan bahwa vector PDF dan drawing yang bersih biasanya memberikan hasil jauh lebih baik dibandingkan raster atau scan. ([Reddit][25])

---

# 12. Teknologi deteksi lain yang sangat relevan

## A. Circuit diagram recognition

Repository seperti Circuitry memisahkan masalah menjadi:

1. object detector untuk komponen;
2. OpenCV untuk kabel;
3. graph untuk koneksi;
4. LLM untuk menjelaskan hasil.

Ini konsep penting: komponen saja tidak cukup. Sistem harus mengetahui koneksinya. ([GitHub][26])

Untuk gambar kerja:

```text
Column, beam, wall = nodes
Connection, adjacency, span = edges
```

atau pada MEP:

```text
Pump, valve, fixture = nodes
Pipe, duct, cable = edges
```

Hasil akhirnya bukan gambar beranotasi, melainkan graph teknis.

---

## B. Engineering drawing component segmentation

Penelitian component segmentation pada engineering drawing mengubah raster menjadi stroke graph melalui:

* thinning;
* stroke tracing;
* fitting kurva Bézier;
* pembentukan graph berdasarkan connectivity;
* GCN untuk mengklasifikasikan text, dimension, dan contour.

Pendekatan ini cocok untuk line drawing karena informasi pentingnya berada pada hubungan garis, bukan tekstur foto. ([arXiv][27])

---

## C. Grounding DINO

Grounding DINO merupakan open-set object detector yang menerima gambar dan text prompt seperti:

```text
“fire extinguisher”
“circular column”
“door swing”
“electrical socket”
```

Model menghasilkan bounding box objek yang sesuai prompt. ([GitHub][28])

Namun, untuk gambar konstruksi, model general-purpose biasanya perlu:

* fine-tuning;
* project-specific examples;
* tiling;
* hard-negative filtering;
* integration dengan text/legend.

Ia berguna sebagai candidate generator, bukan final quantity engine.

---

## D. Domain-specific OCR dan metric learning

EffOCR menggunakan kombinasi object localization dan metric-learning/image-retrieval recognition. Konsep ini cocok untuk font atau simbol teknik yang datanya sedikit, karena karakter dikenali berdasarkan kedekatan dengan contoh referensi. ([GitHub][29])

Prinsip yang bisa diterapkan:

```text
Ambil simbol/karakter dari legend
→ jadikan prototype
→ cari simbol visual terdekat
→ koreksi oleh user
→ perbarui prototype project
```

---

# 13. Repository paling relevan untuk dipelajari

| Repository/proyek      | Nilai untuk Drawing Intelligence             | Catatan                                      |
| ---------------------- | -------------------------------------------- | -------------------------------------------- |
| CubiCasa5K             | Segmentasi ruang, dinding, pintu, junction   | Dataset dan baseline floor plan              |
| Raster-to-Graph        | Mengubah denah menjadi graph struktural      | Sangat relevan untuk hubungan ruang/dinding  |
| DeepFloorplan          | Multi-task room dan boundary detection       | Stack lama, konsep masih bagus               |
| PID Symbol Detection   | Project-specific one-shot symbol recognition | Sangat relevan untuk legend-driven detection |
| eDOCr                  | OCR khusus engineering drawing               | Penting untuk dimensi dan simbol             |
| DocLayout-YOLO         | Mendeteksi zona dokumen                      | Periksa lisensi AGPL untuk komersial         |
| Surya                  | OCR, layout, reading order, table            | Berguna untuk drawing scan                   |
| PaddleOCR PP-Structure | Layout dan table extraction                  | Alternatif document intelligence             |
| Segment Anything       | Positive/negative-point segmentation         | Analog One-Click Area                        |
| Grounding DINO         | Open-vocabulary object detection             | Candidate generator                          |
| DINOv2                 | Visual similarity embedding                  | Analog Auto Count/Find Similar               |
| SAM-Road               | Segmentation menjadi connected graph         | Analog line/pipe/wall tracing                |
| Circuitry              | Detector + wire tracing + graph              | Sangat relevan untuk MEP topology            |

Mayoritas repository tersebut adalah komponen penelitian, bukan sistem takeoff siap produksi. Nilainya ada pada pola arsitektur, bukan langsung di-copy menjadi satu aplikasi.

---

# 14. Arsitektur yang saya rekomendasikan untuk PAAX

## Lapisan 1 — Drawing ingestion

```text
PDF/CAD/Image
   ↓
File classifier
   ↓
Vector extraction + high-resolution raster rendering
   ↓
Unified page coordinate system
```

Simpan primitive berikut:

```json
{
  "lines": [],
  "polylines": [],
  "curves": [],
  "polygons": [],
  "text_spans": [],
  "images": [],
  "layers": []
}
```

Jangan langsung mengubah semua halaman menjadi gambar dan membuang data vektornya.

---

## Lapisan 2 — Page intelligence

Setiap halaman perlu memiliki metadata:

```json
{
  "sheet_number": "S-202",
  "sheet_title": "SECOND FLOOR STRUCTURAL PLAN",
  "discipline": "structural",
  "level": "level_2",
  "scale": "1:100",
  "zones": [
    "drawing",
    "legend",
    "schedule",
    "notes",
    "title_block"
  ]
}
```

Ini menyelesaikan masalah PAAX yang sebelumnya tidak konsisten membedakan lantai satu dan lantai dua.

Sebelum menghitung kolom, sistem harus terlebih dahulu dapat menjawab dengan deterministik:

```text
Halaman ini disiplin apa?
Lantai berapa?
Jenis drawing apa?
Zona drawing aktual berada di mana?
Legenda berada di mana?
```

---

## Lapisan 3 — Project vocabulary

Ekstrak entity dari:

* legend;
* schedule;
* general notes;
* title block;
* keynotes.

Contoh:

```json
{
  "project_entities": {
    "K1": {
      "type": "column",
      "dimensions": "400x400 mm",
      "material": "reinforced_concrete",
      "sources": ["page_8_schedule_row_4"]
    }
  }
}
```

Project vocabulary kemudian menjadi basis untuk symbol detection dan query.

---

## Lapisan 4 — Teach-by-example detection

Pengguna memilih satu contoh K1.

Sistem melakukan:

```text
Reference crop
+ vector signature
+ nearby text
+ size
+ line topology
    ↓
Project-specific prototype
    ↓
Candidate retrieval across selected sheets
```

Pengguna menerima atau menolak kandidat. Koreksi tersebut disimpan sebagai:

* positive samples;
* hard negatives;
* accepted transformations;
* valid scales;
* sheet scope.

Pendekatan ini lebih realistis daripada langsung melatih universal detector.

---

## Lapisan 5 — Geometric reconstruction

Deteksi visual harus dikonversi menjadi objek teknik:

```json
{
  "id": "column-L2-K1-023",
  "type": "column",
  "column_type": "K1",
  "level": "L2",
  "center": [12540, 8430],
  "dimensions_mm": [400, 400],
  "grid_reference": ["C", "4"],
  "source_page": 27,
  "confidence": 0.96
}
```

Quantity dihitung berdasarkan data objek ini, bukan dari narasi AI.

---

## Lapisan 6 — Spatial dan construction graph

Graph minimum:

```text
Project
 ├── Discipline
 ├── Sheet
 ├── Level
 ├── Zone
 ├── Grid
 ├── Space
 ├── Element
 ├── Type Definition
 └── Measurement
```

Relasi utama:

```text
element → located_on → level
element → located_at → grid
element → typed_as → K1
K1 → defined_by → schedule row
element → connected_to → beam
room → bounded_by → walls
measurement → derived_from → geometry
```

Inilah yang seharusnya dibaca Command Room.

---

## Lapisan 7 — Agentic execution

Saat pengguna bertanya:

> “Pada lantai dua ada berapa kolom, jenis apa saja, dan volume K1 berapa?”

Agent membuat execution plan:

```text
1. Resolve "lantai dua" → Level 2.
2. Select structural plan sheets for Level 2.
3. Retrieve all entities type=column.
4. Group by column_type.
5. Retrieve K1 dimensions and height.
6. Validate height source.
7. Calculate:
   count × width × depth × height.
8. Return result with page and object evidence.
```

Bila tinggi kolom tidak ditemukan, sistem tidak boleh mengarang. Outputnya harus mengatakan:

```text
Jumlah dan dimensi tersedia.
Tinggi efektif belum memiliki sumber yang tervalidasi,
sehingga volume belum dihitung.
```

---

# 15. Hal yang sebaiknya tidak dilakukan

## Jangan menggunakan satu VLM untuk seluruh proses

Prompt seperti:

> “Lihat 88 halaman ini dan hitung seluruh elemen.”

akan menghadapi:

* resolusi;
* context window;
* kehilangan koordinat;
* inkonsistensi antarpanggilan;
* hallucination;
* ketidakmampuan memberikan provenance.

VLM baik untuk interpretasi dan orchestration, bukan sebagai satu-satunya geometry engine.

## Jangan menggunakan satu YOLO untuk seluruh disiplin

Simbol proyek sangat bervariasi. Universal detector akan membutuhkan dataset besar dan tetap mengalami domain shift.

Lebih baik:

```text
class-agnostic candidate detector
+ legend-driven one-shot classifier
+ project-specific correction memory
```

## Jangan mengukur langsung dari mask kasar

Mask harus melalui:

* vector snapping;
* polygon repair;
* scale validation;
* duplicate removal;
* topology validation.

## Jangan menyatukan seluruh dokumen menjadi satu JSON naratif

Data harus berbentuk entity dan relationship yang memiliki coordinate serta evidence.

---

# 16. Prioritas pengembangan yang paling rasional

Urutan yang saya nilai paling kuat:

### Tahap 1 — Fondasi terpercaya

* vector/raster ingestion;
* page classification;
* title block extraction;
* scale detection;
* plan zones;
* text index;
* legend dan table extraction.

### Tahap 2 — User-assisted takeoff

* One-Click Area;
* One-Click Line;
* reference-based symbol count;
* Find Similar;
* review candidate;
* evidence overlay.

### Tahap 3 — Project-specific intelligence

* legend-driven one-shot detection;
* Smart Labels;
* cross-reference tag ke schedule;
* level/grid/space association;
* active learning dari koreksi.

### Tahap 4 — Structured building graph

* room graph;
* structural graph;
* MEP network graph;
* cross-sheet entity linking;
* quantity object database.

### Tahap 5 — Agentic Command Room

* question planning;
* tool execution;
* source checking;
* calculation;
* document output;
* uncertainty handling.

Saya tidak menyarankan memulai dari “fully autonomous takeoff”. Produk akan lebih cepat stabil bila dimulai dari:

> **high-confidence assisted takeoff dengan traceable evidence.**

---

# Penilaian akhir terhadap Kreo

Kreo tampaknya unggul bukan karena satu model AI rahasia, melainkan karena menggabungkan:

* vector drawing extraction;
* document layout understanding;
* promptable segmentation;
* visual similarity retrieval;
* OCR dan semantic labels;
* project context;
* deterministic measurement;
* human correction;
* agent orchestration.

Moat terbesarnya kemungkinan berada pada:

1. dataset koreksi pengguna yang terus bertambah;
2. normalization berbagai jenis drawing;
3. geometric post-processing;
4. association antara objek, teks, legenda, dan schedule;
5. UX untuk memperbaiki hasil dengan cepat;
6. workflow agent yang menjalankan tool secara berurutan.


Dengan arsitektur tersebut, PAAX dapat bergerak dari sekadar “AI yang melihat gambar” menjadi **sistem drawing intelligence yang memiliki bukti, koordinat, relasi, dan quantity yang dapat diaudit**.

Saya dapat memantau pembaruan Kreo, repository drawing intelligence, dan diskusi komunitas estimator setiap minggu lalu melaporkan perubahan teknis yang relevan. Mau saya jadwalkan?

[1]: https://www.kreo.net/news-2d-takeoff/agentic-computer-vision-for-construction-drawings?utm_source=chatgpt.com "Kreo 6.0 — Agentic Computer Vision for Construction Drawings"
[2]: https://help-takeoff.kreo.net/en/articles/5723499-what-is-kreo-software?utm_source=chatgpt.com "What is Kreo Software? | Kreo Software"
[3]: https://help-takeoff.kreo.net/en/articles/11688694-plan-zones?utm_source=chatgpt.com "Plan Zones | Kreo Software"
[4]: https://github.com/opendatalab/DocLayout-YOLO?utm_source=chatgpt.com "GitHub - opendatalab/DocLayout-YOLO: DocLayout-YOLO: Enhancing Document Layout Analysis through Diverse Synthetic Data and Global-to-Local Adaptive Perception · GitHub"
[5]: https://help-takeoff.kreo.net/en/articles/11688693-ai-smart-labels?utm_source=chatgpt.com "AI Smart Labels | Kreo Software"
[6]: https://github.com/javvi51/eDOCr?utm_source=chatgpt.com "GitHub - javvi51/eDOCr: A packaged OCR system for mechanical engineering drawings based on keras-ocr · GitHub"
[7]: https://help-takeoff.kreo.net/en/articles/8718150-one-click-area?utm_source=chatgpt.com "One-Click Area | Kreo Software"
[8]: https://help-takeoff.kreo.net/en/articles/5481213-auto-count?utm_source=chatgpt.com "Auto Count | Kreo Software"
[9]: https://github.com/facebookresearch/dinov2?utm_source=chatgpt.com "GitHub - facebookresearch/dinov2: PyTorch code and models for the DINOv2 self-supervised learning method. · GitHub"
[10]: https://github.com/mgupta70/PID_Symbol_Detection?utm_source=chatgpt.com "GitHub - mgupta70/PID_Symbol_Detection: Detect symbols in Piping & Instrumentation Drawings · GitHub"
[11]: https://help-takeoff.kreo.net/en/articles/9875875-find-similar-with-ai?utm_source=chatgpt.com "Find Similar with AI | Kreo Software"
[12]: https://help-takeoff.kreo.net/en/articles/5481199-auto-measure?utm_source=chatgpt.com "Auto Measure | Kreo Software"
[13]: https://help-takeoff.kreo.net/en/articles/9722231-auto-measure-2-0?utm_source=chatgpt.com "Auto Measure 2.0 | Kreo Software"
[14]: https://github.com/cubicasa/cubicasa5k?utm_source=chatgpt.com "GitHub - CubiCasa/CubiCasa5k: CubiCasa5k floor plan dataset · GitHub"
[15]: https://github.com/zlzeng/DeepFloorplan?utm_source=chatgpt.com "GitHub - zlzeng/DeepFloorplan · GitHub"
[16]: https://github.com/SizheHu/Raster-to-Graph?utm_source=chatgpt.com "GitHub - SizheHu/Raster-to-Graph: Official implementation of the paper \"Raster-to-Graph: Floorplan Recognition via Autoregressive Graph Prediction with an Attention Transformer\". (EG 2024) · GitHub"
[17]: https://help-takeoff.kreo.net/en/articles/9993983-one-click-line?utm_source=chatgpt.com "One-Click Line | Kreo Software"
[18]: https://github.com/htcr/sam_road?utm_source=chatgpt.com "GitHub - htcr/sam_road: Segment Anything Model for large-scale, vectorized road network extraction from aerial imagery. CVPRW 2024 · GitHub"
[19]: https://github.com/YXu556/RoadExtraction?utm_source=chatgpt.com "GitHub - YXu556/RoadExtraction · GitHub"
[20]: https://help-takeoff.kreo.net/en/articles/11688696-cross-reference?utm_source=chatgpt.com "Cross Reference | Kreo Software"
[21]: https://www.kreo.net/?utm_source=chatgpt.com "AI Takeoff and Estimating Software for Construction — Kreo ..."
[22]: https://www.reddit.com/r/estimators/comments/1kadwx5/are_there_actually_any_aibased_takeoff_software/ "Are there actually any AI-based takeoff software worth exploring? : r/estimators"
[23]: https://www.reddit.com/r/estimators/comments/18yzxcp/ai_estimating_software/ "AI estimating Software : r/estimators"
[24]: https://www.reddit.com/r/estimators/comments/1diydu3/artificial_intelligence_and_takeoffs/ "Artificial Intelligence and takeoffs  : r/estimators"
[25]: https://www.reddit.com/r/estimators/comments/1l0eknj/anyone_using_early_ai_for_quantity_takeoffs/ "Anyone Using early AI for quantity takeoffs? : r/estimators"
[26]: https://github.com/tonny-2200/circuitry?utm_source=chatgpt.com "GitHub - tonny-2200/circuitry: Circuitry.ai is an open-source tool that combines computer vision and large language models to detect, analyze, and explain electronic circuit diagrams. It leverages YOLOv8 for component detection and LLaMA 3 for generating intelligent textual explanations of how the circuit works. · GitHub"
[27]: https://arxiv.org/abs/2212.00290?utm_source=chatgpt.com "Component Segmentation of Engineering Drawings Using Graph Convolutional Networks"
[28]: https://github.com/idea-research/groundingdino?utm_source=chatgpt.com "GitHub - IDEA-Research/GroundingDINO: [ECCV 2024] Official implementation of the paper \"Grounding DINO: Marrying DINO with Grounded Pre-Training for Open-Set Object Detection\" · GitHub"
[29]: https://github.com/dell-research-harvard/effocr?utm_source=chatgpt.com "GitHub - dell-research-harvard/effocr: A model(ing framework) for sample efficient OCR · GitHub"
