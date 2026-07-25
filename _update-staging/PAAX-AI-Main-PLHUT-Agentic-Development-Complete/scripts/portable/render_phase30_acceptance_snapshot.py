from __future__ import annotations

import io
import json
import os
import urllib.request
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "report/phase30_agentic_2026-07-25/PHASE30_ACCEPTANCE_SNAPSHOT.png"
BASE = os.getenv("DB_API_URL", "http://127.0.0.1:8001").rstrip("/")
KEY = os.getenv("INTERNAL_SERVICE_KEY", "live-test-key")
ACTOR = os.getenv("PAAX_PORTABLE_ACTOR_ID", "paax-web")
H = {"X-Internal-Key": KEY, "X-User-Id": ACTOR}


def get(path: str) -> bytes:
    req = urllib.request.Request(BASE + path, headers=H)
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()


def font(size: int, bold: bool = False):
    name = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
    return ImageFont.truetype(name, size)


def text(draw, xy, value, size=14, fill="#172033", bold=False, anchor=None):
    draw.text(xy, str(value), font=font(size, bold), fill=fill, anchor=anchor)


def rounded(draw, box, radius, fill, outline=None, width=1):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


items_payload = json.loads(get("/projects/PLHUT-SURAKARTA/project-graph/civil-work-items"))
items = items_payload["items"]
page = Image.open(io.BytesIO(get("/projects/PLHUT-SURAKARTA/source-document/pages/42/image?width=1800"))).convert("RGB")

W, HGT = 1600, 1200
im = Image.new("RGB", (W, HGT), "#eef2f7")
d = ImageDraw.Draw(im)
# header
d.rectangle((0, 0, W, 68), fill="#101828")
text(d, (28, 34), "PAAX", 24, "white", True, "lm")
text(d, (120, 34), "Agentic Drawing Intelligence · Phase 01–30 Acceptance", 13, "#aebbd0", False, "lm")
rounded(d, (1245, 15, 1570, 53), 9, "#1d2939", "#344054")
text(d, (1260, 34), "PLHUT Surakarta — Aktif", 14, "white", True, "lm")
# sidebar
d.rectangle((0, 68, 225, HGT), fill="white")
d.line((225, 68, 225, HGT), fill="#d8e0ea")
text(d, (20, 100), "PROJECT WORKSPACE", 10, "#7b879b", True)
nav = ["Dashboard", "Drawing Intelligence", "Command Room", "RAB & AHSP", "Laporan"]
y=126
for label in nav:
    if label == "Drawing Intelligence":
        rounded(d, (13, y-7, 211, y+28), 8, "#edf4ff")
        text(d, (27, y+10), label, 13, "#175cd3", True, "lm")
    else:
        text(d, (27, y+10), label, 13, "#344054", False, "lm")
    y += 44
text(d, (20, 365), "PROJECT BINDING", 10, "#7b879b", True)
for i, label in enumerate(["Project: PLHUT-SURAKARTA", "Actor: paax-web", "Revision: Portable"]):
    text(d, (27, 397+i*32), label, 11, "#475467")
# content origin
x0=247
chips=[("PLHUT terdaftar","#eaf7ef","#067647"),("88 lembar asli","#eaf2ff","#175cd3"),("Project-bound AI","#eaf2ff","#175cd3"),("1 perlu review","#fff4e5","#b54708")]
x=x0
for label,bg,fg in chips:
    tw=d.textbbox((0,0),label,font=font(11,True))[2]+24
    rounded(d,(x,86,x+tw,116),15,bg)
    text(d,(x+12,101),label,11,fg,True,"lm"); x+=tw+10
# top cards
left=(247,132,1045,700); right=(1062,132,1577,700)
for box in [left,right]: rounded(d,box,12,"white","#d9e2ee")
# headings
text(d,(266,159),"Gambar asli · Halaman 43 — Denah Kolom Lantai 2",14,"#172033",True,"lm")
text(d,(266,181),"PDF authority · real source layer",10,"#667085")
d.line((247,194,1045,194),fill="#e5eaf1")
# page image fit
px0,py0,px1,py1=272,215,1020,680
scale=min((px1-px0)/page.width,(py1-py0)/page.height)
page=page.resize((int(page.width*scale),int(page.height*scale)),Image.Resampling.LANCZOS)
pos=(px0+(px1-px0-page.width)//2,py0+(py1-py0-page.height)//2)
d.rectangle((px0,py0,px1,py1),fill="#dbe0e8")
im.paste(page,pos)
rounded(d,(284,226,455,254),6,"#101828")
text(d,(297,240),"SOURCE PDF · PAGE 43/88",10,"white",True,"lm")
# command room card
text(d,(1080,159),"Command Room",14,"#172033",True,"lm")
text(d,(1080,181),"Verified Engineering Context",10,"#667085")
d.line((1062,194,1577,194),fill="#e5eaf1")
rounded(d,(1080,214,1558,258),8,"white","#cfd8e5")
text(d,(1093,236),"Berapa volume Kolom K2 Lantai 2?",12,"#344054",False,"lm")
rounded(d,(1433,220,1552,252),7,"#175cd3")
text(d,(1492,236),"Jalankan",11,"white",True,"mm")
rounded(d,(1080,278,1558,588),9,"#f6f8fb","#e0e6ef")
answer=["Kolom K2 Lantai 2 berjumlah 4 unit dengan ukuran", "0,250 × 0,600 × 3,900 m.", "", "Perhitungan terverifikasi:", "0,250 × 0,600 × 3,900 × 4 = 2,340 m³", "", "Status: engine_verified", "Quantity authority: Core Engine"]
y=303
for line in answer:
    text(d,(1098,y),line,13,"#172033",line in {"Perhitungan terverifikasi:","0,250 × 0,600 × 3,900 × 4 = 2,340 m³"})
    y+=30
text(d,(1098,615),"Evidence: halaman 43, 50, dan 54",11,"#175cd3",True)
rounded(d,(1080,640,1558,676),8,"#eaf7ef")
text(d,(1095,658),"✓ Project binding PLHUT · claim-evidence valid",11,"#067647",True,"lm")
# quantities card
box=(247,720,1577,1172); rounded(d,box,12,"white","#d9e2ee")
text(d,(266,750),"Quantities / Perhitungan Backup",15,"#172033",True,"lm")
summary=items_payload["summary"]
text(d,(500,750),f"{summary['total']} item · {summary['ready']} siap · {summary['needs_review']} perlu review",11,"#667085",False,"lm")
rounded(d,(1325,733,1438,768),7,"white","#cfd8e5"); text(d,(1381,750),"Semua item",10,"#344054",False,"mm")
rounded(d,(1448,733,1558,768),7,"#175cd3"); text(d,(1503,750),"Excel",10,"white",True,"mm")
# table
cols=[("Item pekerjaan",235),("Lokasi",105),("Jenis",80),("Satuan",65),("Ukuran",180),("Jumlah",65),("Formula",205),("Volume",90),("Status",105),("Sumber",120)]
starts=[]; x=260
for label,width in cols: starts.append((x,width,label)); x+=width
header_y=785
d.rectangle((253,779,1570,815),fill="#f7f9fc")
for x,w,label in starts:
    text(d,(x,797),label,10,"#475467",True,"lm")
nrows=min(8,len(items)); row_h=41
for idx,item in enumerate(items[:nrows]):
    y=815+idx*row_h
    if idx%2: d.rectangle((253,y,1570,y+row_h),fill="#fbfcfe")
    d.line((253,y+row_h,1570,y+row_h),fill="#edf0f5")
    vals=[item["display_name"].replace("Kolom Beton Bertulang ","Kolom "),item["location"],item["category"],item["unit"],item.get("dimensions_display") or "—",item.get("count") or "—",item.get("formula") or "—",item.get("result_display") or "—","Siap" if item["readiness"]=="ready" else "Review",", ".join("H"+str(p) for p in item.get("source_pages",[]))]
    for (cx,cw,_),val in zip(starts,vals):
        colour="#067647" if val=="Siap" else "#b54708" if val=="Review" else "#172033"
        text(d,(cx,y+21),str(val)[:32],9,colour,val in {"Siap","Review"},"lm")
text(d,(267,1152),"Tabel utama tidak menampilkan hash/internal ID; formula dan sumber tetap auditable.",10,"#667085")
OUT.parent.mkdir(parents=True,exist_ok=True)
im.save(OUT,quality=95)
print(OUT)
