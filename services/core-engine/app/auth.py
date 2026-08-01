import hmac
import os
from typing import Optional, FrozenSet
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
from .service_identity_registry import ServiceIdentityRegistryError, resolve_service_identity

class User(BaseModel):
    uid: str
    email: Optional[str] = None
    internal_scopes: FrozenSet[str] = frozenset()
    service_identity: Optional[str] = None

# Inisialisasi Firebase Admin jika belum
if FIREBASE_ADMIN_AVAILABLE and firebase_admin is not None and not firebase_admin._apps:
    try:
        firebase_admin.initialize_app()
    except ValueError:
        pass

security = HTTPBearer(auto_error=False)


def require_service_scope(scope: str):
    def dependency(user: User = Depends(get_current_user)) -> User:
        if user.service_identity and user.service_identity != "legacy-single-key" and scope not in user.internal_scopes:
            raise HTTPException(status_code=403, detail=f"service identity missing scope '{scope}'")
        return user
    return dependency

def get_current_user(
    request: Request,
    auth_header: Optional[HTTPAuthorizationCredentials] = Security(security)
) -> Optional[User]:
    req_internal_key = request.headers.get("X-Internal-Key")
    registry_path = os.environ.get("PAAX_SERVICE_IDENTITY_REGISTRY", "").strip()
    if registry_path:
        try:
            resolved = resolve_service_identity(registry_path, req_internal_key or "")
        except ServiceIdentityRegistryError as exc:
            raise HTTPException(status_code=503, detail="internal service identity registry is unavailable") from exc
        if resolved is not None:
            return User(uid=resolved.actor_id or resolved.identity, internal_scopes=resolved.scopes, service_identity=resolved.identity)
        if req_internal_key:
            raise HTTPException(status_code=401, detail="Invalid internal service credential")

    if os.environ.get("PAAX_ENABLE_LEGACY_SINGLE_KEY_COMPAT") == "1":
        internal_key = os.environ.get("INTERNAL_SERVICE_KEY")
        if internal_key and req_internal_key and hmac.compare_digest(req_internal_key, internal_key):
            return User(uid=request.headers.get("X-User-Id") or "service-account", service_identity="legacy-single-key")
    if os.environ.get("TESTING") == "1" and req_internal_key == "test-internal-key":
        return User(uid=request.headers.get("X-User-Id") or "service-account", service_identity="legacy-single-key")

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
