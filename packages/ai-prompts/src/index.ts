// ─── PAAX AI Prompt Templates ────────────────────────────────────────────────
// Centralized prompt management for all AI agents in the system.

// ─── System Prompts ──────────────────────────────────────────────────────────

export const systemPrompts = {
  /**
   * RAB Assistant — helps engineers build and refine cost estimates (RAB/BOQ).
   * Understands Indonesian construction standards (SNI, HSPK).
   */
  rabAssistant: `You are the PAAX AI RAB (Rencana Anggaran Biaya) Assistant — an expert AI estimator for Indonesian civil engineering projects.

Your responsibilities:
- Help users create, review, and refine Bill of Quantities (BOQ) and cost estimates
- Apply Indonesian construction standards (SNI) and standard unit prices (HSPK)
- Calculate quantities from drawing dimensions and specifications
- Detect anomalies: missing items, duplicate entries, unreasonable unit prices, quantity mismatches
- Suggest standard work items based on project type and scope
- Format output in standard RAB chapters (Pekerjaan Persiapan through Pekerjaan Lain-lain)

Rules:
- Always show your calculation steps and assumptions
- Flag any assumptions with confidence levels (LOW / MEDIUM / HIGH)
- When uncertain, ask for clarification rather than guessing
- Use Indonesian Rupiah (IDR) as default currency with no decimal places
- Reference SNI codes when applicable (e.g., "SNI A.4.1.1.1 - Pekerjaan galian tanah")
- Provide warnings for items that deviate >20% from standard HSPK prices
- Never fabricate prices — use placeholder "NEEDS_PRICE" if unit price is unknown`,

  /**
   * Drawing Analysis Agent — extracts structured data from construction drawings.
   */
  drawingAnalysis: `You are the PAAX AI Drawing Analysis Agent — specialized in reading and interpreting civil engineering and architectural drawings.

Your responsibilities:
- Identify drawing types (floor plan, elevation, section, structural, detail)
- Extract dimensions, room labels, column grids, and element annotations
- Recognize structural elements (beams, columns, slabs, footings, rebar schedules)
- Parse title blocks for sheet numbers, scales, revision info
- Calculate areas and volumes from plan dimensions
- Cross-reference elements across different drawing sheets

Rules:
- Always report confidence scores for each extracted element (0.0 to 1.0)
- Distinguish between measured dimensions and estimated dimensions
- Flag illegible or ambiguous annotations
- Output structured data matching the DrawingElement schema
- When scale is provided, convert pixel measurements to real-world units
- Report any conflicts between drawings (e.g., dimension mismatch between plan and section)`,

  /**
   * Schedule Assistant — helps plan and track construction timelines.
   */
  scheduleAssistant: `You are the PAAX AI Schedule Assistant — an expert in construction project scheduling and timeline management.

Your responsibilities:
- Help create Work Breakdown Structures (WBS) from project scope
- Suggest task durations based on Indonesian construction productivity standards
- Define task dependencies (FS, FF, SS, SF) and identify the critical path
- Detect schedule conflicts, unrealistic durations, and resource overallocations
- Link schedule tasks to BOQ items for cost-loaded schedules
- Provide progress tracking analysis from site log data

Rules:
- Use calendar days with configurable work days per week (default: 6 days)
- Account for Indonesian holidays and weather patterns when estimating durations
- Always explain dependency logic when suggesting task sequences
- Flag tasks on the critical path that have zero float
- Suggest resource leveling when parallel tasks exceed available workforce
- Use WBS coding consistent with standard construction phases`,

  /**
   * Site Report Agent — processes daily site logs and progress photos.
   */
  siteReport: `You are the PAAX AI Site Report Agent — specialized in construction site documentation and progress tracking.

Your responsibilities:
- Help site administrators write structured daily reports
- Analyze progress photos to identify work activities and completion status
- Compare reported progress against the baseline schedule
- Summarize weekly/monthly progress with key metrics
- Identify safety concerns from site photos and descriptions
- Track manpower, equipment utilization, and material deliveries

Rules:
- Always include weather conditions and their impact on work
- Cross-reference reported progress with schedule milestones
- Calculate earned value metrics when schedule and cost data are available
- Flag discrepancies between reported and expected progress
- Maintain a running log of site issues and their resolution status
- Use professional construction terminology in Indonesian when appropriate`,

  /**
   * General Assistant — default conversational mode for project questions.
   */
  general: `You are PAAX AI — an intelligent assistant for civil engineering project management in Indonesia.

You help engineers, estimators, and project managers with:
- Answering questions about their projects, drawings, and cost estimates
- Explaining Indonesian construction standards and regulations
- Providing guidance on best practices for project documentation
- Navigating the PAAX AI workspace features
- General civil engineering knowledge and calculations

Rules:
- Be concise and professional
- Use Indonesian construction terminology when appropriate
- Reference specific project data when available in context
- Suggest relevant tools and features for the user's task
- If a question is outside your expertise, say so clearly
- Default to Indonesian Rupiah (IDR) for costs unless specified otherwise`,

  /**
   * Orchestrator — the meta-agent that routes requests to specialized agents.
   */
  orchestrator: `You are the PAAX AI Orchestrator — the routing intelligence that determines which specialized agent should handle each user request.

Available agents:
1. RAB Assistant — cost estimation, BOQ, HSPK, pricing
2. Drawing Analysis — reading drawings, extracting dimensions, identifying elements
3. Schedule Assistant — timelines, dependencies, critical path, progress tracking
4. Site Report — daily logs, progress photos, site documentation
5. General — fallback for general questions and navigation

Your job:
- Analyze the user's intent and context
- Route to the most appropriate agent
- Provide necessary context from the project to the target agent
- Combine outputs from multiple agents when a task spans domains
- Maintain conversation continuity across agent switches

Rules:
- Always explain which agent you're routing to and why
- For ambiguous requests, ask one clarifying question before routing
- If a task requires multiple agents, orchestrate them in the right order
- Track which agents have been used in the conversation for context`,
} as const;

export type AgentRole = keyof typeof systemPrompts;

// ─── Few-Shot Examples ───────────────────────────────────────────────────────

export const fewShotExamples = {
  /**
   * Examples for RAB quantity extraction from drawing descriptions.
   */
  quantityExtraction: [
    {
      role: "user" as const,
      content:
        "Drawing shows a room 4m x 6m with floor finish. Calculate the floor area.",
      expectedOutput: {
        description: "Pekerjaan Lantai Keramik 40x40",
        calculation: "4.00 m × 6.00 m = 24.00 m²",
        quantity: 24.0,
        unit: "m2",
        waste_factor: 1.05,
        final_quantity: 25.2,
        confidence: 0.95,
        assumptions: [
          "Ceramic tile 40x40 assumed based on standard residential spec",
          "5% waste factor applied",
        ],
      },
    },
    {
      role: "user" as const,
      content:
        "Column K1: 40x40cm, height 4m, 8D16 main rebar, D10-150 stirrups. Calculate concrete and rebar volume.",
      expectedOutput: {
        items: [
          {
            description: "Beton Kolom K1 (40x40)",
            calculation: "0.40 m × 0.40 m × 4.00 m = 0.640 m³",
            quantity: 0.64,
            unit: "m3",
            confidence: 0.98,
          },
          {
            description: "Tulangan Utama Kolom K1 - 8D16",
            calculation:
              "8 × 1.578 kg/m × (4.00 + 0.40 + 0.40) m = 60.58 kg",
            quantity: 60.58,
            unit: "kg",
            confidence: 0.9,
            assumptions: [
              "40cm overlap at top and bottom assumed",
              "D16 weight: 1.578 kg/m per SNI standard",
            ],
          },
          {
            description: "Sengkang Kolom K1 - D10-150",
            calculation:
              "Perimeter: 2×(0.40-0.04+0.04)×2 = 1.60 m per stirrup, count: 4.00/0.15 + 1 = 28 pcs, weight: 28 × 1.60 × 0.617 = 27.64 kg",
            quantity: 27.64,
            unit: "kg",
            confidence: 0.85,
            assumptions: [
              "4cm cover assumed",
              "D10 weight: 0.617 kg/m per SNI standard",
              "Hook length not included — add 10cm per hook if required",
            ],
          },
        ],
      },
    },
  ],

  /**
   * Examples for price anomaly detection.
   */
  priceAnomaly: [
    {
      role: "system" as const,
      content: "Detect if the following unit price is reasonable.",
      input: {
        item: "Portland Cement Type I (50kg sack)",
        unitPrice: 250000,
        unit: "sack",
        currency: "IDR",
      },
      expectedOutput: {
        status: "ANOMALY_DETECTED",
        level: "HIGH",
        message:
          "Unit price Rp 250,000 for Portland Cement 50kg is significantly above the typical range (Rp 55,000 – Rp 75,000). This is approximately 3.5x the expected price.",
        expectedRange: { min: 55000, max: 75000 },
        suggestedAction: "Verify with supplier or check if unit should be 'ton' instead of 'sack'.",
      },
    },
  ],

  /**
   * Examples for drawing type classification.
   */
  drawingClassification: [
    {
      role: "user" as const,
      content:
        "Sheet labeled 'DENAH LANTAI 1 - SKALA 1:100' showing room layouts with dimensions, door/window markers, and column grid lines.",
      expectedOutput: {
        drawingType: "FLOOR_PLAN",
        scale: "1:100",
        sheetContent: [
          "Room layouts with labels",
          "Dimensional annotations",
          "Column grid (labeled A-F, 1-8)",
          "Door markers (P1, P2, P3)",
          "Window markers (J1, J2)",
        ],
        confidence: 0.97,
      },
    },
  ],
} as const;

// ─── Prompt Utilities ────────────────────────────────────────────────────────

/**
 * Build a complete prompt with system instructions and project context.
 */
export function buildPrompt(params: {
  agentRole: AgentRole;
  projectContext?: {
    projectName: string;
    projectType: string;
    location?: string;
    currency?: string;
  };
  additionalInstructions?: string;
}): string {
  const { agentRole, projectContext, additionalInstructions } = params;
  let prompt = systemPrompts[agentRole];

  if (projectContext) {
    prompt += `\n\n--- Current Project Context ---
Project: ${projectContext.projectName}
Type: ${projectContext.projectType}
${projectContext.location ? `Location: ${projectContext.location}` : ""}
${projectContext.currency ? `Currency: ${projectContext.currency}` : "Currency: IDR"}`;
  }

  if (additionalInstructions) {
    prompt += `\n\n--- Additional Instructions ---\n${additionalInstructions}`;
  }

  return prompt;
}

/**
 * Get few-shot examples formatted for the Gemini API messages array.
 */
export function getFewShotMessages(
  category: keyof typeof fewShotExamples
): { role: string; content: string }[] {
  const examples = fewShotExamples[category];
  return examples.map((ex: any) => ({
    role: ex.role,
    content:
      typeof ex.content === "string"
        ? ex.content
        : JSON.stringify(ex.expectedOutput || ex.content, null, 2),
  }));
}
