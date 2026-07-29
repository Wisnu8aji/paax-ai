import os
from typing import Optional, List, FrozenSet
from fastapi import Request, HTTPException, Security, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
try:
    import firebase_admin
    from firebase_admin import auth, credentials
    FIREBASE_ADMIN_AVAILABLE = True
except ImportError:  # Portable/offline runtime may intentionally use internal service auth only.
    firebase_admin = None
    auth = None
    credentials = None
    FIREBASE_ADMIN_AVAILABLE = False
from pydantic import BaseModel

class User(BaseModel):
    uid: str
    email: Optional[str] = None
    internal_scopes: FrozenSet[str] = frozenset()

# Inisialisasi Firebase Admin jika belum
if FIREBASE_ADMIN_AVAILABLE and not firebase_admin._apps:
    # Karena kita jalankan di GCP (Cloud Run), default creds akan dipakai
    # Jangan hardcode service account key di sini!
    try:
        firebase_admin.initialize_app()
    except ValueError:
        pass # App already initialized or no default credentials (e.g. testing)

security = HTTPBearer(auto_error=False)

def get_current_user(
    request: Request,
    auth_header: Optional[HTTPAuthorizationCredentials] = Security(security)
) -> Optional[User]:
    # 1. Cek Service-to-Service auth dulu (X-Internal-Key)
    internal_key = os.environ.get("INTERNAL_SERVICE_KEY")
    if not internal_key and os.environ.get("TESTING") == "1":
        internal_key = "test-internal-key"
    req_internal_key = request.headers.get("X-Internal-Key")
    
    if internal_key and req_internal_key == internal_key:
        uid = request.headers.get("X-User-Id") or os.environ.get("PAAX_PORTABLE_ACTOR_ID", "service-account")
        configured = os.environ.get("INTERNAL_SERVICE_SCOPES")
        if not configured and os.environ.get("TESTING") == "1":
            configured = "dem:authorize-actor,dem:read,dem:write"
        scopes = frozenset(scope.strip() for scope in (configured or "").split(",") if scope.strip())
        return User(uid=uid, internal_scopes=scopes)

    # 2. Cek Firebase JWT
    if not auth_header:
        raise HTTPException(status_code=401, detail="Missing authentication token")
    
    token = auth_header.credentials
    try:
        # Jika environment testing (no GCP creds), mungkin ini gagal.
        # Untuk testing tanpa mock, bisa di bypass jika testing env,
        # tapi kita butuh mock saat pytest.
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

# RBAC khusus DB Service (cek database tabel project_members)
from .database import get_db
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from . import models

class RoleChecker:
    def __init__(self, allowed_roles: List[str], service_scope: Optional[str] = None):
        self.allowed_roles = allowed_roles
        # Optional explicit scope a trusted internal-service identity may present
        # instead of a human project role. Deployment config grants this scope
        # (INTERNAL_SERVICE_SCOPES); the caller cannot self-elevate with a header.
        self.service_scope = service_scope

    async def __call__(
        self,
        id: str, # Matches project_id in route path
        db: AsyncSession = Depends(get_db),
        user: User = Depends(get_current_user)
    ):
        if self.service_scope and self.service_scope in user.internal_scopes:
            return user

        result = await db.execute(
            select(models.ProjectMember)
            .where(
                models.ProjectMember.project_id == id,
                models.ProjectMember.user_id == user.uid
            )
        )
        member = result.scalars().first()
        
        # Owner of the project is implicitly 'owner' role
        # We should check the projects table as fallback, but R10 says
        # enforce roles. If user is owner, they might not be in project_members yet,
        # but for safety let's check projects table if not found.
        if not member:
            proj_res = await db.execute(
                select(models.Project).where(models.Project.id == id)
            )
            proj = proj_res.scalars().first()
            if proj and proj.owner_id == user.uid:
                member_role = "owner"
            else:
                raise HTTPException(status_code=403, detail="Not a member of this project")
        else:
            member_role = member.role

        if member_role not in self.allowed_roles and "owner" not in [member_role]:
             # Owner can do anything (as per R10 matrix)
             if member_role != "owner":
                 raise HTTPException(status_code=403, detail=f"Role {member_role} not allowed")

        return user


async def require_project_access(
    project_id: Optional[str],
    db: AsyncSession,
    user: User,
    *,
    service_scope: str,
) -> None:
    """Authorize access to a project-scoped resource whose project_id is only
    known after loading the resource itself (e.g. a DEM run/page looked up by
    its own id). A trusted internal-service caller must carry an explicit
    scope granted by deployment config; the X-Internal-Key header alone only
    proves the caller is a known service, not that it may touch this project.
    An end-user caller must be a member (or owner) of the project.
    """
    if user.internal_scopes:
        if service_scope in user.internal_scopes:
            return
        raise HTTPException(status_code=403, detail=f"service identity missing scope '{service_scope}'")

    if not project_id:
        raise HTTPException(status_code=403, detail="resource has no project scope")

    result = await db.execute(
        select(models.ProjectMember).where(
            models.ProjectMember.project_id == project_id,
            models.ProjectMember.user_id == user.uid,
        )
    )
    if result.scalars().first() is not None:
        return

    proj_res = await db.execute(select(models.Project).where(models.Project.id == project_id))
    proj = proj_res.scalars().first()
    if proj and proj.owner_id == user.uid:
        return

    raise HTTPException(status_code=403, detail="Not a member of this project")


async def is_project_member_or_owner(project_id: str, actor_id: str, db: AsyncSession) -> bool:
    """Pure membership check for an explicit actor_id, independent of the
    caller's own identity. Used by /internal/authorize-actor: a trusted
    internal-service caller (verified by X-Internal-Key at that route) asks
    this on behalf of a *different* real end-user (the one who actually made
    the original public request), so that upstream service can enforce
    end-user project membership without forwarding that user's own bearer
    token across services or trusting a caller-supplied X-User-Id as if it
    were self-authenticating."""
    result = await db.execute(
        select(models.ProjectMember).where(
            models.ProjectMember.project_id == project_id,
            models.ProjectMember.user_id == actor_id,
        )
    )
    if result.scalars().first() is not None:
        return True
    proj_res = await db.execute(select(models.Project).where(models.Project.id == project_id))
    proj = proj_res.scalars().first()
    return bool(proj and proj.owner_id == actor_id)
