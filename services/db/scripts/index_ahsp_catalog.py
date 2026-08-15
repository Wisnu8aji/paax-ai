import os
import sys
import json
import uuid
import requests

DB_API_URL = os.environ.get("DB_API_URL", "http://localhost:8001")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
PAAX_DATA_DIR = os.environ.get("PAAX_DATA_DIR", "D:/paax-data")

def get_embedding(text: str) -> list[float]:
    if not GEMINI_API_KEY:
        raise ValueError("GEMINI_API_KEY is not set")
    
    url = f"https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key={GEMINI_API_KEY}"
    payload = {
        "model": "models/text-embedding-004",
        "content": {
            "parts": [{"text": text}]
        }
    }
    
    response = requests.post(url, json=payload)
    if not response.ok:
        raise RuntimeError(f"Embedding failed: {response.text}")
    
    data = response.json()
    embedding = data.get("embedding", {}).get("values")
    if not embedding:
        raise RuntimeError(f"No embedding returned: {data}")
        
    return embedding

def index_ahsp_catalog():
    if not os.path.exists(PAAX_DATA_DIR):
        print(f"Data dir {PAAX_DATA_DIR} does not exist. Skipping indexing.")
        return

    ahsp_file = os.path.join(PAAX_DATA_DIR, "ahsp.json")
    if not os.path.exists(ahsp_file):
        # Generate a fake one for testing if not exists since we are in dev and data is not committed
        print("Real ahsp.json not found, using fixture for idempotency test.")
        ahsp_data = {
            "items": [
                {"code": "A.2.2.1-1", "name": "Penggalian 1 m3 tanah biasa sedalam 1 m", "unit": "m3", "bidang": "Umum"},
                {"code": "A.2.2.1-2", "name": "Penggalian 1 m3 tanah keras sedalam 1 m", "unit": "m3", "bidang": "Umum"},
                {"code": "A.2.2.1-3", "name": "Penggalian 1 m3 tanah cadas sedalam 1 m", "unit": "m3", "bidang": "Umum"}
            ]
        }
    else:
        with open(ahsp_file, "r") as f:
            ahsp_data = json.load(f)

    items = ahsp_data.get("items", [])
    if not items:
        # fallback if format is a direct list
        items = ahsp_data if isinstance(ahsp_data, list) else []

    print(f"Indexing {len(items)} AHSP items...")
    
    for item in items:
        code = item.get("code")
        name = item.get("name")
        unit = item.get("unit")
        bidang = item.get("bidang", "Umum")
        
        if not code or not name:
            continue
            
        content = f"{code} {name} ({unit}, {bidang})"
        print(f"Processing: {code} - {name[:30]}...")
        
        try:
            embedding = get_embedding(content)
            
            # Upsert into db-api
            chunk_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"paax:ahsp:{code}"))
            
            payload = {
                "id": chunk_id,
                "source_type": "ahsp",
                "source_ref": code,
                "content": content,
                "embedding": embedding,
                "metadata_json": item
            }
            
            res = requests.post(f"{DB_API_URL}/knowledge/index", json=payload)
            if not res.ok:
                print(f"Failed to index {code}: {res.text}")
                
        except Exception as e:
            print(f"Error processing {code}: {e}")

    print("Indexing complete.")

if __name__ == "__main__":
    index_ahsp_catalog()
