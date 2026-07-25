/** Deterministic claim verification and conservative answer composition.
 *
 * Rebuilt (Target 3, final remediation wave) around per-claim provenance
 * (claim-provenance.ts): a numeric claim's authority now comes from whether
 * its specific value is genuinely present in a specific tool result, not
 * from "some Core Engine tool was called somewhere in this turn." See
 * claim-provenance.ts's module docstring for the exact bug this replaces
 * (one query_rab volume result used to authorize an unrelated fabricated
 * price sitting in the same response).
 */
import { buildClaims, type Claim, type ToolResultRecord } from "./claim-provenance";

export type NumericAuthorityClass = Claim["authority_class"];

export interface ClaimAuthority {
  quantityAuthority: "none" | "measurement_fact" | "core_engine";
  evidenceCount?: number;
  allowedClaims?: string[];
  forbiddenClaims?: string[];
  conflicts?: unknown[];
}

export interface VerifiedClaim {
  claim: string;
  numericClass: NumericAuthorityClass;
  status: "verified" | "manual_review_required" | "rejected";
  reason?: string;
}

function toVerifiedClaim(claim: Claim): VerifiedClaim {
  return {
    claim: claim.text,
    numericClass: claim.authority_class,
    status: claim.verification_status,
    reason: claim.reason,
  };
}

export function verifyAndComposeClaims(input: {
  responseText: string;
  toolsCalled: string[];
  authority: ClaimAuthority;
  toolResults?: ToolResultRecord[];
}): {
  responseText: string;
  claims: VerifiedClaim[];
  rejected: VerifiedClaim[];
  conflicts: unknown[];
  requiresCoreEngine: boolean;
  structuredClaims: Claim[];
} {
  const conflicts = input.authority.conflicts ?? [];
  const forbidden = input.authority.forbiddenClaims ?? [];
  const evidenceCount = input.authority.evidenceCount ?? 0;

  const structuredClaims = buildClaims({
    responseText: input.responseText,
    toolResults: input.toolResults ?? [],
    writtenFactEvidenceCount: evidenceCount,
    measurementFactAuthority: input.authority.quantityAuthority === "measurement_fact",
    forbiddenClaims: forbidden,
    conflicts,
  });

  const claims = structuredClaims.map(toVerifiedClaim);
  const rejected = claims.filter((claim) => claim.status === "rejected");
  const rejectedStructured = structuredClaims.filter((claim) => claim.verification_status === "rejected");
  const contextualRejected = rejectedStructured.filter((claim) => claim.claim_type === "contextual_occurrence");
  const isContextualPhysicalClaim = contextualRejected.length > 0;

  let responseText = input.responseText;
  if (rejected.length) {
    // Remove the unsupported physical-quantity clause itself rather than the
    // whole line. A sentence may contain a legitimate drawing observation
    // followed by an invalid inference ("3 simbol ..., jadi 3 kolom fisik").
    // The observation must be allowed to survive when evidence-backed.
    for (const claim of contextualRejected) {
      responseText = responseText.split(claim.text).join("");
    }
    for (const claim of rejectedStructured) {
      if (claim.claim_type === "contextual_occurrence") continue;
      responseText = responseText.split(claim.text).join("[klaim ditolak]");
    }
    responseText = responseText
      .replace(/\s+([,.;!?])/g, "$1")
      .replace(/[,;]\s*$/g, "")
      .trim();
    const refusal = isContextualPhysicalClaim
      ? "Kelompok konteks pada gambar bukan jumlah fisik terpasang; kuantitas final harus diverifikasi/routed melalui Core Engine."
      : "Klaim angka proyek tanpa evidence dan authority tidak ditampilkan; kuantitas final harus diverifikasi/routed melalui Core Engine.";
    responseText = [responseText, refusal].filter(Boolean).join("\n\n");
  }
  if (conflicts.length) {
    responseText = [responseText, "Konflik data perlu direview sebelum klaim proyek digunakan."].filter(Boolean).join("\n\n");
  }
  return { responseText, claims, rejected, conflicts, requiresCoreEngine: rejected.length > 0, structuredClaims };
}
