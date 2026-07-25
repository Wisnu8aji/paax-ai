import os
from typing import Optional
from fastapi import Request, HTTPException, Security, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
try:
    import firebase_admin
    from firebase_admin import auth, credentials
    FIREBASE_ADMIN_AVAILABLE = True
except ImportError:
    firebase_admin = None
    auth = None
    credentials = None
    FIREBASE_ADMIN_AVAILABLE = False
from pydantic import BaseModel

class User(BaseModel):
    uid: str
    email: Optional[str] = None

# Inisialisasi Firebase Admin jika belum
if FIREBASE_ADMIN_AVAILABLE and firebase_admin is not None and not firebase_admin._apps:
    try:
        firebase_admin.initialize_app()
    except ValueError:
        pass

security = HTTPBearer(auto_error=False)

def get_current_user(
    request: Request,
    auth_header: Optional[HTTPAuthorizationCredentials] = Security(security)
) -> Optional[User]:
    # 1. Cek Service-to-Service auth dulu (X-Internal-Key)
    internal_key = os.environ.get("INTERNAL_SERVICE_KEY")
    # The well-known test key is only ever a valid bypass under an explicit
    # TESTING=1 flag (matching services/db's auth.py convention) -- never
    # merely because ENV defaults to "development" when unset. A misconfigured
    # production deployment that forgot both ENV and INTERNAL_SERVICE_KEY must
    # not silently accept a well-known key.
    if not internal_key and os.environ.get("TESTING") == "1":
        internal_key = "test-internal-key"
    req_internal_key = request.headers.get("X-Internal-Key")
    
    if internal_key and req_internal_key == internal_key:
        uid = request.headers.get("X-User-Id") or os.environ.get("PAAX_PORTABLE_ACTOR_ID", "service-account")
        return User(uid=uid)

    # 2. Cek Firebase JWT
    if not auth_header:
        raise HTTPException(status_code=401, detail="Missing authentication token")
    
    token = auth_header.credentials
    try:
        if os.environ.get("TESTING") == "1":
            if token.startswith("test-token-"):
                uid = token.replace("test-token-", "")
                return User(uid=uid)
            else:
                raise HTTPException(status_code=401, detail="Invalid testing token")

        if not FIREBASE_ADMIN_AVAILABLE or auth is None:
            raise HTTPException(
                status_code=503,
                detail="Firebase Admin is unavailable; use the configured internal service identity in portable mode",
            )
        decoded_token = auth.verify_id_token(token)
        return User(
            uid=decoded_token.get("uid"),
            email=decoded_token.get("email")
        )
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid authentication token: {str(e)}")
