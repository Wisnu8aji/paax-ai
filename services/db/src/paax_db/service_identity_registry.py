"""Fail-closed resolver for portable internal service identities.

The registry deliberately contains credential hashes only.  Raw credentials are
kept in per-service runtime key files by the portable launcher and injected
into the child process environment in memory.
"""
from __future__ import annotations

from dataclasses import dataclass
import hashlib
import hmac
import json
from pathlib import Path
from typing import FrozenSet, Optional


class ServiceIdentityRegistryError(RuntimeError):
    """The configured registry cannot be trusted."""


@dataclass(frozen=True)
class ServiceIdentity:
    identity: str
    scopes: FrozenSet[str]
    actor_id: Optional[str] = None


def _credential_hash(credential: str) -> str:
    return hashlib.sha256(credential.encode("utf-8")).hexdigest()


def resolve_service_identity(registry_path: str, credential: str) -> Optional[ServiceIdentity]:
    """Resolve *credential* against a versioned hash-only registry.

    A malformed or inaccessible configured registry is an operational error,
    never a reason to accept a legacy key or caller-provided scope headers.
    """
    if not credential:
        return None
    path = Path(registry_path)
    try:
        document = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ServiceIdentityRegistryError("configured service identity registry is unreadable") from exc
    if not isinstance(document, dict) or document.get("version") != 1:
        raise ServiceIdentityRegistryError("configured service identity registry has an unsupported format")
    identities = document.get("identities")
    if not isinstance(identities, list):
        raise ServiceIdentityRegistryError("configured service identity registry has no identities list")

    candidate_hash = _credential_hash(credential)
    matched: Optional[ServiceIdentity] = None
    for row in identities:
        if not isinstance(row, dict):
            raise ServiceIdentityRegistryError("configured service identity registry contains an invalid identity")
        identity = row.get("identity")
        credential_sha256 = row.get("credential_sha256")
        scopes = row.get("scopes")
        actor_id = row.get("actor_id")
        if (
            not isinstance(identity, str) or not identity
            or not isinstance(credential_sha256, str) or len(credential_sha256) != 64
            or not isinstance(scopes, list) or any(not isinstance(scope, str) or not scope for scope in scopes)
            or (actor_id is not None and (not isinstance(actor_id, str) or not actor_id))
        ):
            raise ServiceIdentityRegistryError("configured service identity registry contains invalid fields")
        if hmac.compare_digest(candidate_hash, credential_sha256):
            if matched is not None:
                raise ServiceIdentityRegistryError("configured service identity registry has duplicate credentials")
            matched = ServiceIdentity(identity=identity, scopes=frozenset(scopes), actor_id=actor_id)
    return matched
