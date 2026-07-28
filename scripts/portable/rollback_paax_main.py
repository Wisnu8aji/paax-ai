from __future__ import annotations
import argparse, json, os, shutil
from datetime import datetime, timezone
from pathlib import Path

PRESERVE = [".env.local", "apps/web/.env.local", "data/portable", ".local-runtime", ".git"]

def copy_path(src: Path, dst: Path) -> None:
    if not src.exists(): return
    if src.is_dir():
        if dst.exists(): shutil.rmtree(dst)
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copytree(src, dst)
    else:
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)

def main() -> int:
    ap=argparse.ArgumentParser(description='Rollback PAAX source from an update backup while preserving current runtime state.')
    ap.add_argument('--target',type=Path,required=True)
    ap.add_argument('--backup',type=Path,required=True)
    ap.add_argument('--dry-run',action='store_true')
    a=ap.parse_args(); target=a.target.resolve(); backup=a.backup.resolve()
    if not (backup/'package.json').is_file(): raise SystemExit(f'Invalid backup: {backup}')
    if not (target/'package.json').is_file(): raise SystemExit(f'Invalid target: {target}')
    temp=target.parent/f'{target.name}.rollback-tmp'
    preserved=[rel for rel in PRESERVE if (target/rel).exists()]
    if not a.dry_run:
        if temp.exists(): shutil.rmtree(temp)
        shutil.copytree(backup,temp)
        for rel in preserved: copy_path(target/rel,temp/rel)
        old=target.parent/f'{target.name}.rollback-old'
        if old.exists(): shutil.rmtree(old)
        os.replace(target,old); os.replace(temp,target); shutil.rmtree(old)
        report={'schema_version':'paax.rollback-report.v1','created_at':datetime.now(timezone.utc).isoformat(),'target':str(target),'backup':str(backup),'preserved':preserved,'status':'PASS'}
        out=target/'report/PAAX_LAST_ROLLBACK_REPORT.json'; out.parent.mkdir(parents=True,exist_ok=True); out.write_text(json.dumps(report,indent=2),encoding='utf-8')
    else: report={'schema_version':'paax.rollback-report.v1','target':str(target),'backup':str(backup),'preserved':preserved,'dry_run':True,'status':'PASS'}
    print(json.dumps(report,ensure_ascii=False,indent=2)); return 0
if __name__=='__main__': raise SystemExit(main())
