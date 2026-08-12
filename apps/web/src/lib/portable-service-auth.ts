import { readFileSync } from "node:fs";

/** Resolve the per-process credential for server-side portable proxies. */
export function getPortableServiceKey(): string {
  const credentialPath = process.env.PAAX_WEB_INTERNAL_SERVICE_KEY_FILE?.trim();
  if (credentialPath) {
    try {
      const credential = readFileSync(credentialPath, "utf8").trim();
      if (credential) return credential;
    } catch {
      // Fall through to the environment compatibility paths below.
    }
  }
  return (
    process.env.PAAX_WEB_INTERNAL_SERVICE_KEY?.trim() ||
    process.env.INTERNAL_SERVICE_KEY?.trim() ||
    (process.env.NODE_ENV === "test" ? "test-internal-key" : "")
  );
}
