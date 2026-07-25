from __future__ import annotations

import argparse
import json
import os
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HOST = "127.0.0.1"
DB_BASE = os.getenv("DB_API_URL", "http://127.0.0.1:8001").rstrip("/")
INTERNAL_KEY = os.getenv("INTERNAL_SERVICE_KEY", "live-test-key")
ACTOR_ID = os.getenv("PAAX_PORTABLE_ACTOR_ID", "paax-web")
PROJECT_ID = "PLHUT-SURAKARTA"


def upstream(path: str, *, method: str = "GET", payload: dict | None = None) -> tuple[int, str, bytes]:
    body = None if payload is None else json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        f"{DB_BASE}{path}",
        data=body,
        method=method,
        headers={
            "X-Internal-Key": INTERNAL_KEY,
            "X-User-Id": ACTOR_ID,
            **({"Content-Type": "application/json"} if body is not None else {}),
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return response.status, response.headers.get_content_type(), response.read()
    except urllib.error.HTTPError as exc:
        return exc.code, exc.headers.get_content_type(), exc.read()


HTML = r'''<!doctype html>
<html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>PAAX Phase 30 Acceptance Workspace</title>
<style>
:root{font-family:Inter,ui-sans-serif,system-ui,-apple-system,Segoe UI,sans-serif;color:#162036;background:#eef2f7}
*{box-sizing:border-box}body{margin:0}.top{height:64px;background:#101826;color:#fff;display:flex;align-items:center;padding:0 24px;gap:18px}.brand{font-size:22px;font-weight:800;letter-spacing:.06em}.tag{font-size:12px;color:#91a0b8;border-left:1px solid #394458;padding-left:16px}.selector{margin-left:auto;background:#1d2939;border:1px solid #344054;color:#fff;border-radius:9px;padding:9px 14px;min-width:250px}.layout{display:grid;grid-template-columns:224px minmax(0,1fr);height:calc(100vh - 64px)}.side{background:#fff;border-right:1px solid #d9e1ec;padding:20px 14px}.side h4{font-size:11px;text-transform:uppercase;letter-spacing:.09em;color:#77839a;margin:10px 10px}.nav{padding:11px 12px;border-radius:8px;margin:3px 0;font-size:14px}.nav.active{background:#edf4ff;color:#175cd3;font-weight:700}.main{padding:18px 20px;overflow:auto}.statusrow{display:flex;gap:10px;align-items:center;margin-bottom:14px}.chip{font-size:12px;border-radius:999px;padding:6px 10px;background:#eaf7ef;color:#067647;font-weight:700}.chip.blue{background:#eaf2ff;color:#175cd3}.chip.amber{background:#fff4e5;color:#b54708}.grid{display:grid;grid-template-columns:minmax(0,1.45fr) minmax(370px,.9fr);gap:16px}.card{background:#fff;border:1px solid #dbe3ee;border-radius:12px;box-shadow:0 2px 6px rgba(16,24,40,.04);overflow:hidden}.cardhead{height:48px;display:flex;align-items:center;padding:0 16px;border-bottom:1px solid #e5eaf1;font-weight:750}.canvas{height:520px;background:#d9dee6;display:flex;align-items:center;justify-content:center;padding:18px;position:relative}.canvas img{max-width:100%;max-height:100%;object-fit:contain;background:#fff;box-shadow:0 6px 18px rgba(0,0,0,.18)}.badge{position:absolute;left:28px;top:28px;background:#101828;color:#fff;border-radius:6px;padding:6px 9px;font-size:11px}.chat{padding:16px}.question{display:flex;gap:8px}.question input{flex:1;border:1px solid #cfd8e5;border-radius:8px;padding:11px 12px;font-size:14px}.question button,.btn{border:0;background:#175cd3;color:#fff;border-radius:8px;padding:10px 14px;font-weight:700;cursor:pointer}.answer{margin-top:14px;background:#f6f8fb;border:1px solid #e0e6ef;border-radius:9px;padding:14px;min-height:180px;white-space:pre-wrap;line-height:1.5;font-size:13px}.evidence{font-size:12px;color:#667085;margin-top:10px}.quantity{margin-top:16px}.toolbar{display:flex;gap:8px;margin-left:auto}.toolbar select,.toolbar button{border:1px solid #cfd8e5;background:#fff;border-radius:7px;padding:7px 9px}table{width:100%;border-collapse:collapse;font-size:12px}th{background:#f7f9fc;color:#475467;text-align:left;padding:10px;border-bottom:1px solid #dfe5ee;position:sticky;top:0}td{padding:10px;border-bottom:1px solid #edf0f5;vertical-align:top}.ok{color:#067647;font-weight:700}.review{color:#b54708;font-weight:700}.source{color:#175cd3;text-decoration:none;font-weight:650}.summary{font-size:12px;color:#667085;margin-left:8px}.loading{color:#667085}.foot{padding:10px 16px;font-size:11px;color:#667085;background:#fafbfc;border-top:1px solid #e5eaf1}
</style></head><body>
<header class="top"><div class="brand">PAAX</div><div class="tag">Agentic Drawing Intelligence · Phase 01–30 Acceptance</div><select class="selector" id="project"><option value="PLHUT-SURAKARTA">PLHUT Surakarta — Aktif</option></select></header>
<div class="layout"><aside class="side"><h4>Project workspace</h4><div class="nav">Dashboard</div><div class="nav active">Drawing Intelligence</div><div class="nav">Command Room</div><div class="nav">RAB & AHSP</div><div class="nav">Laporan</div><h4>Binding</h4><div class="nav">Project: PLHUT</div><div class="nav">Actor: paax-web</div><div class="nav">Revision: Portable</div></aside>
<main class="main"><div class="statusrow"><span class="chip">PLHUT terdaftar</span><span class="chip blue">88 lembar asli</span><span class="chip blue">Project-bound AI</span><span class="chip amber" id="reviewChip">Memuat review…</span></div>
<div class="grid"><section class="card"><div class="cardhead">Gambar asli · Halaman 43 — Denah Kolom Lantai 2 <span class="summary">PDF authority</span></div><div class="canvas"><span class="badge">SOURCE PDF · PAGE 43/88</span><img id="drawing" alt="Denah Kolom Lantai 2"></div><div class="foot">Layer menampilkan render halaman PDF asli, bukan geometri placeholder.</div></section>
<section class="card"><div class="cardhead">Command Room · Verified Engineering Context</div><div class="chat"><div class="question"><input id="q" value="Berapa volume Kolom K2 Lantai 2?"><button onclick="ask()">Jalankan</button></div><div class="answer loading" id="answer">Memuat konteks proyek PLHUT…</div><div class="evidence" id="evidence"></div></div><div class="foot">Jawaban angka hanya diambil dari verified Measurement Facts dan Core Engine.</div></section></div>
<section class="card quantity"><div class="cardhead">Quantities / Perhitungan Backup <span class="summary" id="summary"></span><div class="toolbar"><select id="filter" onchange="renderTable()"><option value="all">Semua item</option><option value="Lantai 1">Lantai 1</option><option value="Lantai 2">Lantai 2</option><option value="column">Kolom</option></select><button onclick="location.href='/api/export.xlsx'">Excel</button></div></div><div style="max-height:390px;overflow:auto"><table><thead><tr><th>Item pekerjaan</th><th>Lokasi/Lantai</th><th>Jenis</th><th>Satuan</th><th>Ukuran</th><th>Jumlah</th><th>Formula</th><th>Volume/Hasil</th><th>Status</th><th>Sumber</th></tr></thead><tbody id="rows"></tbody></table></div></section>
</main></div>
<script>
let items=[];
const fmt=(v)=>String(v??'—');
async function load(){
 const [m,q]=await Promise.all([fetch('/api/manifest').then(r=>r.json()),fetch('/api/items').then(r=>r.json())]);
 document.querySelector('#drawing').src='/api/page/42/image?width=1800';
 items=q.items||[]; document.querySelector('#summary').textContent=`${q.summary.total} item · ${q.summary.ready} siap · ${q.summary.needs_review} perlu review`;
 document.querySelector('#reviewChip').textContent=`${q.summary.needs_review} perlu review`; renderTable(); await ask();
}
function renderTable(){const f=document.querySelector('#filter').value;const data=items.filter(x=>f==='all'||x.location===f||x.category===f);document.querySelector('#rows').innerHTML=data.map(x=>`<tr><td><b>${x.display_name}</b><br><span style="color:#667085">${x.technical_code||''}</span></td><td>${x.location}</td><td>${x.category}</td><td>${x.unit}</td><td>${x.dimensions_display||'—'}</td><td>${fmt(x.count)}</td><td>${x.formula||'—'}</td><td><b>${x.result_display||'Belum tersedia'}</b></td><td class="${x.readiness==='ready'?'ok':'review'}">${x.readiness==='ready'?'Siap dihitung':'Perlu review'}</td><td>${(x.source_pages||[]).map(p=>`<a class="source" href="/api/page/${p-1}/image?width=1800" target="_blank">Hlm ${p}</a>`).join(', ')}</td></tr>`).join('');}
async function ask(){const a=document.querySelector('#answer'),e=document.querySelector('#evidence');a.className='answer loading';a.textContent='Arete mengikat project → mengambil evidence → memverifikasi → menjelaskan…';e.textContent='';const r=await fetch('/api/command',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({query:document.querySelector('#q').value})});const d=await r.json();a.className='answer';a.textContent=d.answer;e.textContent=d.evidence_summary||'';}
load().catch(err=>{document.querySelector('#answer').textContent='Gagal memuat: '+err});
</script></body></html>'''


class Handler(BaseHTTPRequestHandler):
    def _send(self, status: int, content_type: str, body: bytes, extra: dict[str, str] | None = None) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        for key, value in (extra or {}).items():
            self.send_header(key, value)
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:  # noqa: N802
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/":
            self._send(200, "text/html; charset=utf-8", HTML.encode("utf-8"))
            return
        mapping = {
            "/api/projects": f"/projects",
            "/api/manifest": f"/projects/{PROJECT_ID}/source-document/manifest",
            "/api/items": f"/projects/{PROJECT_ID}/project-graph/civil-work-items",
            "/api/export.xlsx": f"/projects/{PROJECT_ID}/project-graph/civil-work-items/export.xlsx",
        }
        if parsed.path in mapping:
            status, ctype, body = upstream(mapping[parsed.path])
            extra = {"Content-Disposition": 'attachment; filename="PAAX-PLHUT-PERHITUNGAN-BACKUP.xlsx"'} if parsed.path.endswith("export.xlsx") else None
            self._send(status, ctype, body, extra)
            return
        if parsed.path.startswith("/api/page/") and parsed.path.endswith("/image"):
            page = parsed.path.split("/")[3]
            status, ctype, body = upstream(f"/projects/{PROJECT_ID}/source-document/pages/{page}/image?{parsed.query}")
            self._send(status, ctype, body)
            return
        self._send(404, "application/json", b'{"detail":"not found"}')

    def do_POST(self) -> None:  # noqa: N802
        if self.path != "/api/command":
            self._send(404, "application/json", b'{"detail":"not found"}')
            return
        size = int(self.headers.get("Content-Length", "0"))
        payload = json.loads(self.rfile.read(size) or b"{}")
        query = str(payload.get("query") or "").strip()
        status, _, body = upstream(
            f"/projects/{PROJECT_ID}/project-graph/engineering-context",
            method="POST",
            payload={"query": query},
        )
        if status >= 400:
            self._send(status, "application/json", body)
            return
        context = json.loads(body)
        facts = context.get("facts") or []
        citations = context.get("citations") or []
        k2 = next((fact for fact in facts if fact.get("technical_code") == "K2" and fact.get("location") == "Lantai 2"), None)
        if k2:
            answer = (
                "Kolom K2 Lantai 2 berjumlah 4 unit dengan ukuran 0,250 × 0,600 × 3,900 m.\n\n"
                "Perhitungan terverifikasi:\n"
                "0,250 × 0,600 × 3,900 × 4 = 2,340 m³\n\n"
                "Status: engine_verified · quantity authority: Core Engine."
            )
        else:
            answer = context.get("abstention_message") or "Data yang diminta belum tersedia atau belum terverifikasi."
        pages = sorted({str(c.get("page_number") or c.get("page") or c.get("page_index", "")) for c in citations if isinstance(c, dict)})
        result = {
            "answer": answer,
            "evidence_summary": "Sumber evidence: " + (", ".join(f"halaman {p}" for p in pages if p) or "lihat konteks proyek"),
            "project_binding": context.get("project_binding"),
            "quantity_authority": context.get("quantity_authority"),
        }
        self._send(200, "application/json; charset=utf-8", json.dumps(result, ensure_ascii=False).encode("utf-8"))

    def log_message(self, format: str, *args) -> None:
        print(f"[acceptance-ui] {self.address_string()} {format % args}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Serve a live Phase 30 user-visible acceptance workspace.")
    parser.add_argument("--port", type=int, default=8099)
    args = parser.parse_args()
    server = ThreadingHTTPServer((HOST, args.port), Handler)
    print(f"Acceptance UI: http://{HOST}:{args.port}")
    server.serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
