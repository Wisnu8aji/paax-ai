import os
from typing import Optional
from fastapi import Request, HTTPException, Security, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import firebase_admin
from firebase_admin import auth, credentials
from pydantic import BaseModel

class User(BaseModel):
    uid: str
    email: Optional[str] = None

# Inisialisasi Firebase Admin jika belum
if not firebase_admin._apps:
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
    env_mode = os.environ.get("ENV", "development")
    internal_key = os.environ.get("INTERNAL_SERVICE_KEY")
    if not internal_key and env_mode in {"development", "test"}:
        internal_key = "test-internal-key"
    req_internal_key = request.headers.get("X-Internal-Key")
    
    if internal_key and req_internal_key == internal_key:
        uid = request.headers.get("X-User-Id", "service-account")
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

        decoded_token = auth.verify_id_token(token)
        return User(
            uid=decoded_token.get("uid"),
            email=decoded_token.get("email")
        )
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid authentication token: {str(e)}")
