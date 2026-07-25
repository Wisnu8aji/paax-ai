from __future__ import annotations
import json, threading
from pathlib import Path
from typing import Any, Literal
from pydantic import BaseModel, Field

OverlayType=Literal['takeoff','markup','punch','photo','issue','rfi','review_pin','site_progress']
class PageOverlayItem(BaseModel):
    overlay_id: str
    project_id: str
    source_document_hash: str
    page_index: int
    overlay_type: OverlayType
    geometry: dict[str,Any]
    title: str
    status: str='open'
    source_entity_id: str | None=None
    evidence_refs: list[str]=Field(default_factory=list)

class PlanRoomRepository:
    _lock=threading.RLock()
    def __init__(self,path:Path): self.path=path; path.parent.mkdir(parents=True,exist_ok=True)
    def upsert(self,item:PageOverlayItem)->PageOverlayItem:
        with self._lock:
            data=self._load(); key=f'{item.project_id}|{item.overlay_id}'; data[key]=item.model_dump(mode='json'); self._save(data); return item
    def page(self,project_id:str,source_document_hash:str,page_index:int)->list[PageOverlayItem]:
        with self._lock: items=[PageOverlayItem.model_validate(v) for v in self._load().values()]
        return sorted([x for x in items if x.project_id==project_id and x.source_document_hash==source_document_hash and x.page_index==page_index],key=lambda x:(x.overlay_type,x.overlay_id))
    def _load(self): return json.loads(self.path.read_text()) if self.path.exists() else {}
    def _save(self,data):
        t=self.path.with_suffix(self.path.suffix+'.tmp'); t.write_text(json.dumps(data,indent=2,sort_keys=True),encoding='utf-8'); t.replace(self.path)
