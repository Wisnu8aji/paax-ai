/**
 * Structured per-claim numerical provenance (Target 3, final remediation
 * wave). Replaces the single whole-response NumericAuthorityClass in
 * claim-pipeline.ts: previously one Core Engine tool call in a turn
 * authorized *every* numeric claim in the final answer, so a fabricated
 * price sitting next to a real Core Engine volume both got the same
 * authority. Here, each numeric claim is checked against the actual
 * structured tool results produced this turn -- a value only counts as
 * authorized if it is genuinely present in a specific tool result's own
 * output, and that result's tool determines the claim's authority_class.
 */

export type ClaimType =
  | "count" | "dimension" | "elevation" | "area" | "volume" | "price"
  | "duration" | "percentage" | "ahsp_code" | "mep_unit_count"
  | "schedule_value" | "label_observation_count" | "contextual_occurrence" | "unknown";

export type AuthorityClass =
  | "core_engine_result" | "measurement_fact" | "written_fact"
  | "non_authoritative_reference" | "forbidden_inference";

export type ConflictStatus = "none" | "conflicting_sources";

export type VerificationStatus = "verified" | "manual_review_required" | "rejected";

export interface Claim {
  claim_id: string;
  text: string;
  value: number | null;
  unit_or_category: string | null;
  claim_type: ClaimType;
  source_result_id: string | null;
  measurement_fact_ids: string[];
  evidence_refs: string[];
  authority_class: AuthorityClass;
  conflict_status: ConflictStatus;
  verification_status: VerificationStatus;
  reason?: string;
}

export interface ToolResultRecord {
  /** Stable per-call id (e.g. "query_rab:0"); becomes a claim's source_result_id. */
  result_id: string;
  tool: string;
  result: unknown;
}

const CORE_ENGINE_TOOLS = new Set(["query_rab", "query_schedule", "run_scenario"]);
const DRAWING_EVIDENCE_TOOLS = new Set(["query_project_graph", "analyze_drawing"]);
const REFERENCE_TOOLS = new Set(["lookup_ahsp"]);

const CLAIM_PATTERNS: Array<{ type: ClaimType; regex: RegExp; unitGroup?: number }> = [
  { type: "price", regex: /\bRp\s?([\d.,]+)/gi },
  { type: "area", regex: /\b(\d[\d.,]*)\s?(?:m2|m²)\b/gi, unitGroup: -1 },
  { type: "volume", regex: /\b(\d[\d.,]*)\s?m3\b/gi, unitGroup: -1 },
  { type: "dimension", regex: /\b(\d[\d.,]*)\s?m'\b/gi, unitGroup: -1 },
  // First side of a compound written dimension (e.g. 250 × 600 mm).  The
  // ordinary unit-suffix rule below captures 600; this look-ahead captures
  // 250 as a separate claim so both numbers must bind to provenance.
  { type: "dimension", regex: /\b(\d+(?:[.,]\d+)?)\s*(?=[x×]\s*\d+(?:[.,]\d+)?\s*(?:mm|cm)\b)/gi, unitGroup: -1 },
  { type: "dimension", regex: /\b(\d+(?:[.,]\d+)?)\s?(?:mm|cm)\b/gi, unitGroup: -1 },
  { type: "elevation", regex: /[+±]\s?(\d+(?:[.,]\d+)?)\s?m\b/gi },
  { type: "duration", regex: /\b(\d+(?:[.,]\d+)?)\s?(?:hari|minggu|bulan)\b/gi },
  { type: "percentage", regex: /\b(\d+(?:[.,]\d+)?)\s?%\b/gi },
  { type: "ahsp_code", regex: /\b([A-Z]\.\d+(?:\.\d+)*(?:-\d+)?)\b/g },
  { type: "label_observation_count", regex: /\b(\d+(?:[.,]\d+)?)\s?(?:label(?:\/simbol)?|simbol)(?:\s+teramati)?\b/gi },
  { type: "count", regex: /\b(\d+(?:[.,]\d+)?)\s?(?:kolom|balok|pintu|jendela|unit|buah|titik|batang)\b/gi },
];

const HA_PATTERN = /\b(\d[\d.,]*)\s?ha\b/gi;

const PHYSICAL_QUANTITY_ASSERTION = /(?:occurrence_count|kelompok konteks|context group|drawing context|konteks gambar|simbol\b).{0,100}(?:jumlah fisik|fisik terpasang|jumlah (?:kolom|balok|unit)|physical quantity)/i;
const PHYSICAL_QUANTITY_CLAUSE = /(?:,?\s*(?:jadi|sehingga|maka)\s+)?(?:jumlah fisik|fisik terpasang|jumlah (?:kolom|balok|unit)|physical quantity)[^.!?\n]*(?:[.!?]|$)/i;

function parseIdNumber(raw: string): number | null {
  const normalized = raw.replace(/\./g, "").replace(",", ".");
  const value = Number.parseFloat(normalized);
  return Number.isFinite(value) ? value : null;
}

/** Recursively flattens every numeric leaf in a tool result into a set of
 * normalized string values, so a claim's value can be checked for genuine
 * membership regardless of where in the result JSON it appears. */
function collectNumericValues(node: unknown, out: Set<number>): void {
  if (typeof node === "number" && Number.isFinite(node)) {
    out.add(node);
    return;
  }
  if (typeof node === "string") {
    // Tool fields often carry compound written dimensions such as
    // "250 × 600 mm". Parsing only from the beginning bound 250 but silently
    // missed 600, weakening per-claim provenance. Preserve the whole-string
    // parse for plain numeric values and also collect every bounded number.
    const asNumber = parseIdNumber(node);
    if (asNumber !== null) out.add(asNumber);
    for (const match of node.matchAll(/[-+]?\d+(?:[.,]\d+)?/g)) {
      const value = parseIdNumber(match[0]);
      if (value !== null) out.add(value);
    }
    return;
  }
  if (Array.isArray(node)) {
    for (const item of node) collectNumericValues(item, out);
    return;
  }
  if (node && typeof node === "object") {
    for (const value of Object.values(node)) collectNumericValues(value, out);
  }
}

/** Flattens every string leaf (for ahsp_code / textual claims that aren't
 * purely numeric, e.g. "A.2.1.1-3"). */
function collectStringValues(node: unknown, out: Set<string>): void {
  if (typeof node === "string") {
    out.add(node);
    return;
  }
  if (Array.isArray(node)) {
    for (const item of node) collectStringValues(item, out);
    return;
  }
  if (node && typeof node === "object") {
    for (const value of Object.values(node)) collectStringValues(value, out);
  }
}

interface CandidateClaim {
  text: string;
  value: number | null;
  claim_type: ClaimType;
}

function extractCandidates(responseText: string): CandidateClaim[] {
  const candidates: CandidateClaim[] = [];
  for (const { type, regex } of CLAIM_PATTERNS) {
    for (const match of responseText.matchAll(regex)) {
      const raw = match[0].trim();
      const numericGroup = match[1];
      candidates.push({
        text: raw,
        value: numericGroup ? parseIdNumber(numericGroup) : null,
        claim_type: type,
      });
    }
  }
  // "ha" is its own pattern (not in CLAIM_PATTERNS' unit-suffix family above)
  // to keep area's m2/m3 grouping simple; matched separately here.
  for (const match of responseText.matchAll(HA_PATTERN)) {
    candidates.push({ text: match[0].trim(), value: parseIdNumber(match[1]), claim_type: "area" });
  }
  return candidates;
}

function findAuthorizingResult(
  candidate: CandidateClaim,
  toolResults: ToolResultRecord[],
): { result: ToolResultRecord; authorityClass: AuthorityClass } | null {
  for (const entry of toolResults) {
    if (candidate.claim_type === "ahsp_code") {
      const strings = new Set<string>();
      collectStringValues(entry.result, strings);
      if (strings.has(candidate.text)) {
        return { result: entry, authorityClass: REFERENCE_TOOLS.has(entry.tool) ? "non_authoritative_reference" : "core_engine_result" };
      }
      continue;
    }
    if (candidate.value === null) continue;
    const numbers = new Set<number>();
    collectNumericValues(entry.result, numbers);
    if (numbers.has(candidate.value)) {
      // A value read from Drawing Intelligence is a written/evidence-backed
      // observation, not a Core Engine result.  This distinction is critical:
      // a symbol count or written dimension may be shown with review status,
      // but it must never authorize a final physical quantity.
      const authorityClass: AuthorityClass = CORE_ENGINE_TOOLS.has(entry.tool)
        ? "core_engine_result"
        : DRAWING_EVIDENCE_TOOLS.has(entry.tool)
          ? "written_fact"
          : REFERENCE_TOOLS.has(entry.tool)
            ? "non_authoritative_reference"
            : "non_authoritative_reference";
      return { result: entry, authorityClass };
    }
  }
  return null;
}

export function buildClaims(input: {
  responseText: string;
  toolResults: ToolResultRecord[];
  writtenFactEvidenceCount: number;
  measurementFactAuthority: boolean;
  forbiddenClaims: string[];
  conflicts: unknown[];
}): Claim[] {
  const contextualMatch = PHYSICAL_QUANTITY_ASSERTION.exec(input.responseText);
  const isContextualPhysicalClaim = contextualMatch !== null;
  const forbiddenLower = input.forbiddenClaims.map((item) => item.toLocaleLowerCase("id-ID"));
  const responseLower = input.responseText.toLocaleLowerCase("id-ID");
  const isForbiddenByPolicy = forbiddenLower.some((item) => item.trim() && responseLower.includes(item));
  const hasConflicts = input.conflicts.length > 0;

  const candidates = extractCandidates(input.responseText);
  if (isContextualPhysicalClaim) {
    // Preserve legitimate written observations (for example "12 simbol
    // teramati") as their own claims, and add a separate claim for the
    // unsupported inference clause (for example "jadi jumlah fisik ...").
    // Previously every candidate in the sentence was marked forbidden, which
    // prevented the composer from retaining a grounded observation while
    // removing only the invalid physical-quantity inference.
    const physicalClause = input.responseText.match(PHYSICAL_QUANTITY_CLAUSE)?.[0]
      ?? contextualMatch[0];
    if (!candidates.some((candidate) => candidate.text === physicalClause)) {
      candidates.push({ text: physicalClause, value: null, claim_type: "contextual_occurrence" });
    }
  }

  return candidates.map((candidate, index): Claim => {
    const claimId = `claim-${index}`;
    if (candidate.claim_type === "contextual_occurrence") {
      return {
        claim_id: claimId, text: candidate.text, value: candidate.value,
        unit_or_category: candidate.claim_type, claim_type: candidate.claim_type,
        source_result_id: null, measurement_fact_ids: [], evidence_refs: [],
        authority_class: "forbidden_inference", conflict_status: "none",
        verification_status: "rejected",
        reason: "contextual occurrence tidak boleh dipresentasikan sebagai jumlah fisik",
      };
    }
    if (isForbiddenByPolicy) {
      return {
        claim_id: claimId, text: candidate.text, value: candidate.value,
        unit_or_category: candidate.claim_type, claim_type: candidate.claim_type,
        source_result_id: null, measurement_fact_ids: [], evidence_refs: [],
        authority_class: "forbidden_inference", conflict_status: hasConflicts ? "conflicting_sources" : "none",
        verification_status: "rejected",
        reason: "klaim proyek berada dalam daftar forbidden_claims",
      };
    }

    const authorizing = findAuthorizingResult(candidate, input.toolResults);
    if (authorizing) {
      if (candidate.claim_type === "count" && DRAWING_EVIDENCE_TOOLS.has(authorizing.result.tool)) {
        return {
          claim_id: claimId, text: candidate.text, value: candidate.value,
          unit_or_category: candidate.claim_type, claim_type: candidate.claim_type,
          source_result_id: authorizing.result.result_id, measurement_fact_ids: [], evidence_refs: [],
          authority_class: "forbidden_inference",
          conflict_status: hasConflicts ? "conflicting_sources" : "none",
          verification_status: "rejected",
          reason: "drawing symbol/label observations do not authorize a physical element count",
        };
      }
      return {
        claim_id: claimId, text: candidate.text, value: candidate.value,
        unit_or_category: candidate.claim_type, claim_type: candidate.claim_type,
        source_result_id: authorizing.result.result_id, measurement_fact_ids: [], evidence_refs: [],
        authority_class: authorizing.authorityClass,
        conflict_status: hasConflicts ? "conflicting_sources" : "none",
        verification_status: authorizing.authorityClass === "core_engine_result" ? "verified" : "manual_review_required",
      };
    }

    if (input.measurementFactAuthority && input.writtenFactEvidenceCount > 0) {
      return {
        claim_id: claimId, text: candidate.text, value: candidate.value,
        unit_or_category: candidate.claim_type, claim_type: candidate.claim_type,
        source_result_id: null, measurement_fact_ids: [], evidence_refs: [],
        authority_class: "measurement_fact", conflict_status: hasConflicts ? "conflicting_sources" : "none",
        verification_status: "verified",
      };
    }
    if (input.writtenFactEvidenceCount > 0) {
      return {
        claim_id: claimId, text: candidate.text, value: candidate.value,
        unit_or_category: candidate.claim_type, claim_type: candidate.claim_type,
        source_result_id: null, measurement_fact_ids: [], evidence_refs: [],
        authority_class: "written_fact", conflict_status: hasConflicts ? "conflicting_sources" : "none",
        verification_status: "manual_review_required",
      };
    }

    // No tool result contains this value, no evidence backs it, and it is
    // not in a forbidden list either -- the conservative default is reject,
    // per "tidak dapat mengikat claim ke authority -> reject atau
    // manual_review_required, bukan menganggap seluruh response aman."
    return {
      claim_id: claimId, text: candidate.text, value: candidate.value,
      unit_or_category: candidate.claim_type, claim_type: candidate.claim_type,
      source_result_id: null, measurement_fact_ids: [], evidence_refs: [],
      authority_class: "forbidden_inference", conflict_status: hasConflicts ? "conflicting_sources" : "none",
      verification_status: "rejected",
      reason: "klaim proyek tidak dapat diikat ke tool result, evidence, atau measurement fact mana pun",
    };
  });
}
