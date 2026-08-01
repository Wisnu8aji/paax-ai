import hashlib, hmac, json, os
from pathlib import Path
from typing import FrozenSet, Optional
from fastapi import Depends, HTTPException, Request, Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel

class User(BaseModel):
    uid: str
    internal_scopes: FrozenSet[str] = frozenset()
    service_identity: Optional[str] = None

security = HTTPBearer(auto_error=False)

def get_current_user(request: Request, auth_header: Optional[HTTPAuthorizationCredentials] = Security(security)) -> User:
    key = request.headers.get("X-Internal-Key") or ""; path = os.environ.get("PAAX_SERVICE_IDENTITY_REGISTRY", "").strip()
    if path:
        try: document = json.loads(Path(path).read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc: raise HTTPException(status_code=503, detail="internal service identity registry is unavailable") from exc
        if not isinstance(document, dict) or document.get("version") != 1 or not isinstance(document.get("identities"), list): raise HTTPException(status_code=503, detail="internal service identity registry is unavailable")
        digest = hashlib.sha256(key.encode()).hexdigest(); found = None
        for row in document["identities"]:
            if not isinstance(row, dict) or not isinstance(row.get("identity"), str) or not isinstance(row.get("credential_sha256"), str) or not isinstance(row.get("scopes"), list): raise HTTPException(status_code=503, detail="internal service identity registry is unavailable")
            if hmac.compare_digest(digest, row["credential_sha256"]):
                if found is not None: raise HTTPException(status_code=503, detail="internal service identity registry is unavailable")
                found = row
        if found is not None: return User(uid=found.get("actor_id") or found["identity"], internal_scopes=frozenset(found["scopes"]), service_identity=found["identity"])
        if key: raise HTTPException(status_code=401, detail="Invalid internal service credential")
    if os.environ.get("PAAX_ENABLE_LEGACY_SINGLE_KEY_COMPAT") == "1" and os.environ.get("INTERNAL_SERVICE_KEY") and hmac.compare_digest(key, os.environ["INTERNAL_SERVICE_KEY"]): return User(uid=request.headers.get("X-User-Id") or "service-account", service_identity="legacy-single-key")
    if os.environ.get("TESTING") == "1" and key == "test-internal-key": return User(uid="test", service_identity="legacy-single-key")
    raise HTTPException(status_code=401, detail="Missing authentication token")

def require_site_access(user: User = Depends(get_current_user)) -> User:
    if user.service_identity and user.service_identity != "legacy-single-key" and "site:access" not in user.internal_scopes: raise HTTPException(status_code=403, detail="service identity missing scope 'site:access'")
    return user
