/** Deterministic claim verification and conservative answer composition. */

export type NumericAuthorityClass =
  | "written_fact"
  | "verified_measurement"
  | "core_engine_result"
  | "non_authoritative_reference"
  | "forbidden_inference";

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

const PROJECT_NUMBER = /\bRp\s?[\d.,]+|\b\d[\d.,]*\s?(?:m2|m3|m'|ha)\b|\b\d+(?:[.,]\d+)?\s?(?:hari|minggu|bulan)\b|\b\d+(?:[.,]\d+)?\s?%\b|\b[A-Z]\.\d+(?:\.\d+)*(?:-\d+)?\b|\b\d+(?:[.,]\d+)?\s?(?:mm|cm|m)\b|[+±]\s?\d+(?:[.,]\d+)?\s?m\b|\b\d+(?:[.,]\d+)?\s?(?:kolom|balok|pintu|jendela|unit|buah|titik|batang)\b/gi;
const CORE_ENGINE_TOOLS = new Set(["query_rab", "query_schedule", "run_scenario"]);
const REFERENCE_TOOLS = new Set(["lookup_ahsp", "analyze_drawing"]);
const PHYSICAL_QUANTITY_ASSERTION = /(?:occurrence_count|kelompok konteks|context group).{0,100}(?:jumlah fisik|fisik terpasang|jumlah (?:kolom|balok|unit)|physical quantity)/i;

function hasForbiddenText(text: string, forbidden: string[]): boolean {
  const normalized = text.toLocaleLowerCase("id-ID");
  return forbidden.some((claim) => claim.trim() && normalized.includes(claim.toLocaleLowerCase("id-ID")));
}

function numericClass(authority: ClaimAuthority, toolsCalled: string[]): NumericAuthorityClass {
  if (authority.quantityAuthority === "core_engine" && toolsCalled.some((tool) => CORE_ENGINE_TOOLS.has(tool))) return "core_engine_result";
  if (authority.quantityAuthority === "measurement_fact" && (authority.evidenceCount ?? 0) > 0) return "verified_measurement";
  if ((authority.evidenceCount ?? 0) > 0) return "written_fact";
  if (toolsCalled.some((tool) => REFERENCE_TOOLS.has(tool))) return "non_authoritative_reference";
  return "forbidden_inference";
}

export function verifyAndComposeClaims(input: {
  responseText: string;
  toolsCalled: string[];
  authority: ClaimAuthority;
}): {
  responseText: string;
  claims: VerifiedClaim[];
  rejected: VerifiedClaim[];
  conflicts: unknown[];
  requiresCoreEngine: boolean;
} {
  const conflicts = input.authority.conflicts ?? [];
  const forbidden = input.authority.forbiddenClaims ?? [];
  const isContextualPhysicalClaim = PHYSICAL_QUANTITY_ASSERTION.test(input.responseText);
  const numericCandidates = Array.from(input.responseText.matchAll(PROJECT_NUMBER), (match) => match[0].trim());
  const candidates = isContextualPhysicalClaim && numericCandidates.length === 0
    ? ["contextual physical quantity"]
    : numericCandidates;
  const candidateClass = numericClass(input.authority, input.toolsCalled);
  const forbiddenByPolicy = hasForbiddenText(input.responseText, forbidden) || isContextualPhysicalClaim;
  const claims = candidates.map((claim): VerifiedClaim => {
    if (forbiddenByPolicy || candidateClass === "forbidden_inference") {
      return {
        claim,
        numericClass: "forbidden_inference",
        status: "rejected",
        reason: isContextualPhysicalClaim
          ? "contextual occurrence tidak boleh dipresentasikan sebagai jumlah fisik"
          : "klaim proyek tidak memiliki evidence dan authority numerik yang dapat dipakai",
      };
    }
    return {
      claim,
      numericClass: candidateClass,
      status: candidateClass === "core_engine_result" || candidateClass === "verified_measurement" ? "verified" : "manual_review_required",
    };
  });
  const rejected = claims.filter((claim) => claim.status === "rejected");
  let responseText = input.responseText;
  if (rejected.length) {
    // Remove entire affected lines so partial numeric assertions cannot survive composition.
    responseText = responseText.split("\n")
      .filter((line) => !isContextualPhysicalClaim && !rejected.some((claim) => line.includes(claim.claim)))
      .join("\n").trim();
    const refusal = isContextualPhysicalClaim
      ? "Kelompok konteks pada gambar bukan jumlah fisik terpasang; kuantitas final harus diverifikasi/routed melalui Core Engine."
      : "Klaim angka proyek tanpa evidence dan authority tidak ditampilkan; kuantitas final harus diverifikasi/routed melalui Core Engine.";
    responseText = [responseText, refusal].filter(Boolean).join("\n\n");
  }
  if (conflicts.length) {
    responseText = [responseText, "Konflik data perlu direview sebelum klaim proyek digunakan."].filter(Boolean).join("\n\n");
  }
  return { responseText, claims, rejected, conflicts, requiresCoreEngine: rejected.length > 0 };
}
