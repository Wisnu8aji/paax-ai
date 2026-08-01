import { Request, Response, NextFunction } from "express";
import admin from "firebase-admin";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  try {
    admin.initializeApp();
  } catch (error) {
    // Ignore error in non-GCP environments if no credentials are provided
  }
}

function sameHash(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const reqInternalKey = req.header("X-Internal-Key") || "";
  const registryPath = process.env.PAAX_SERVICE_IDENTITY_REGISTRY?.trim();

  if (registryPath) {
    try {
      const registry = JSON.parse(readFileSync(registryPath, "utf8"));
      if (registry?.version !== 1 || !Array.isArray(registry.identities)) throw new Error("invalid registry");
      const digest = createHash("sha256").update(reqInternalKey).digest("hex");
      const matches = registry.identities.filter((entry: any) => entry && typeof entry.identity === "string" && Array.isArray(entry.scopes) && typeof entry.credential_sha256 === "string" && entry.credential_sha256.length === 64 && sameHash(digest, entry.credential_sha256));
      if (matches.length > 1) throw new Error("duplicate credential");
      if (matches.length === 1) {
        const identity = matches[0];
        (req as any).user = { uid: identity.actor_id || identity.identity, serviceIdentity: identity.identity, internalScopes: identity.scopes };
        if (!identity.scopes.includes("agent:access")) return res.status(403).json({ error: "service identity missing scope 'agent:access'" });
        return next();
      }
      if (reqInternalKey) return res.status(401).json({ error: "Invalid internal service credential" });
    } catch {
      return res.status(503).json({ error: "internal service identity registry is unavailable" });
    }
  }

  const internalKey = process.env.INTERNAL_SERVICE_KEY;
  if (process.env.PAAX_ENABLE_LEGACY_SINGLE_KEY_COMPAT === "1" && internalKey && sameHash(reqInternalKey, internalKey)) {
    const uid = req.header("X-User-Id") || process.env.PAAX_PORTABLE_ACTOR_ID?.trim() || "paax-web";
    (req as any).user = { uid, serviceIdentity: "legacy-single-key", internalScopes: [] };
    return next();
  }

  // 2. Firebase JWT auth
  const authHeader = req.header("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing authentication token" });
  }

  const token = authHeader.split("Bearer ")[1];

  try {
    if (process.env.TESTING === "1" && token.startsWith("test-token-")) {
      const uid = token.replace("test-token-", "");
      (req as any).user = { uid };
      return next();
    }

    const decodedToken = await admin.auth().verifyIdToken(token);
    (req as any).user = { uid: decodedToken.uid, email: decodedToken.email };
    next();
  } catch (error: any) {
    return res.status(401).json({ error: `Invalid authentication token: ${error.message}` });
  }
}
