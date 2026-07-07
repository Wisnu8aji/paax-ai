import os
from typing import Optional, List
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
    req_internal_key = request.headers.get("X-Internal-Key")
    
    if internal_key and req_internal_key == internal_key:
        # Request datang dari internal service yang valid
        # Bisa juga mengecek apakah ada UID di header (diteruskan dari service pemanggil)
        uid = request.headers.get("X-User-Id", "service-account")
        return User(uid=uid)

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
    def __init__(self, allowed_roles: List[str]):
        self.allowed_roles = allowed_roles

    async def __call__(
        self,
        id: str, # Matches project_id in route path
        db: AsyncSession = Depends(get_db),
        user: User = Depends(get_current_user)
    ):
        # Service account bypass (if uid is service-account, allow)
        if user.uid == "service-account":
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
