import re
from typing import Tuple, Optional
from .loader import load_data, DataStore

def normalize_text(text: str) -> str:
    if not text:
        return ""
    cleaned = re.sub(r'[^a-z0-9]+', ' ', text.lower())
    return cleaned.strip()

def token_set(text: str) -> set:
    return set(filter(None, normalize_text(text).split()))

def similarity(a: str, b: str) -> float:
    aa = token_set(a)
    bb = token_set(b)
    union = len(aa.union(bb)) or 1
    overlap = len(aa.intersection(bb))
    return overlap / union

_store: Optional[DataStore] = None

def get_ahsp_store() -> DataStore:
    global _store
    if _store is None:
        _store = load_data()
    return _store

def suggest_ahsp_for_node(name: str, discipline: str) -> Tuple[Optional[str], float]:
    """
    Mencocokkan name/discipline dari item RabBridgeProposal terhadap katalog AHSP
    via token-overlap sederhana. Mengembalikan (kode_ahsp, confidence).
    """
    if not name:
        return None, 0.25
        
    store = get_ahsp_store()
    search_text = f"{name} {discipline}" if discipline else name
    
    candidates = []
    for code, item in store.ahsp.items():
        score = similarity(search_text, item.name)
        candidates.append((score, code))
        
    if not candidates:
        return None, 0.25
        
    candidates.sort(key=lambda x: x[0], reverse=True)
    best_score, best_code = candidates[0]
    
    if best_score >= 0.45:
        confidence = min(0.95, max(0.7, best_score))
        return best_code, confidence
        
    return None, 0.25
