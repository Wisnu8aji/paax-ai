"""Portable service identity registry adapter (hash-only format v1)."""
from __future__ import annotations
from dataclasses import dataclass
import hashlib, hmac, json
from pathlib import Path
from typing import FrozenSet, Optional

class ServiceIdentityRegistryError(RuntimeError): pass

@dataclass(frozen=True)
class ServiceIdentity:
    identity: str
    scopes: FrozenSet[str]
    actor_id: Optional[str] = None

def resolve_service_identity(registry_path: str, credential: str) -> Optional[ServiceIdentity]:
    if not credential: return None
    try: document = json.loads(Path(registry_path).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc: raise ServiceIdentityRegistryError("registry unreadable") from exc
    if not isinstance(document, dict) or document.get("version") != 1 or not isinstance(document.get("identities"), list):
        raise ServiceIdentityRegistryError("registry format invalid")
    digest = hashlib.sha256(credential.encode("utf-8")).hexdigest(); matched = None
    for row in document["identities"]:
        if not isinstance(row, dict) or not isinstance(row.get("identity"), str) or not row["identity"] or not isinstance(row.get("credential_sha256"), str) or len(row["credential_sha256"]) != 64 or not isinstance(row.get("scopes"), list) or any(not isinstance(scope, str) or not scope for scope in row["scopes"]) or (row.get("actor_id") is not None and (not isinstance(row["actor_id"], str) or not row["actor_id"])):
            raise ServiceIdentityRegistryError("registry identity invalid")
        if hmac.compare_digest(digest, row["credential_sha256"]):
            if matched is not None: raise ServiceIdentityRegistryError("registry has duplicate credentials")
            matched = ServiceIdentity(row["identity"], frozenset(row["scopes"]), row.get("actor_id"))
    return matched
