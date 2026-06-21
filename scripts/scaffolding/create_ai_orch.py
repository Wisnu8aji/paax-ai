import os

base_dir = 'services/ai-orchestrator'

files = {
    f'{base_dir}/src/index.ts': '''import { genkit } from "@genkit-ai/core";
import { googleAI } from "@genkit-ai/googleai";
import { defineFlow, startFlowsServer } from "@genkit-ai/flow";
import { engineeringChatFlow } from "./flows/engineering-chat.flow";

// Initialize Genkit
genkit({
    plugins: [googleAI()],
    flows: [engineeringChatFlow],
});

startFlowsServer();
''',
    f'{base_dir}/src/flows/project-setup.flow.ts': '''import { defineFlow } from "@genkit-ai/flow";
import { z } from "zod";

export const projectSetupFlow = defineFlow(
    {
        name: "projectSetupFlow",
        inputSchema: z.object({ projectName: z.string() }),
        outputSchema: z.object({ status: z.string(), projectId: z.string() })
    },
    async (input) => {
        return { status: "setup_complete", projectId: "proj-123" };
    }
);
''',
    f'{base_dir}/src/flows/engineering-chat.flow.ts': '''import { defineFlow } from "@genkit-ai/flow";
import { z } from "zod";

export const engineeringChatFlow = defineFlow(
    {
        name: "engineeringChatFlow",
        inputSchema: z.object({ message: z.string(), projectId: z.string() }),
        outputSchema: z.object({ reply: z.string(), actions: z.array(z.string()).optional() })
    },
    async (input) => {
        // Mock implementation
        const reply = Menerima pesan: . Angka final dihitung oleh core-engine, bukan LLM.;
        return { reply, actions: ["recalculate_rab"] };
    }
);
''',
    f'{base_dir}/src/flows/rab-advisor.flow.ts': '''import { defineFlow } from "@genkit-ai/flow";
import { z } from "zod";

export const rabAdvisorFlow = defineFlow(
    {
        name: "rabAdvisorFlow",
        inputSchema: z.object({ rabId: z.string() }),
        outputSchema: z.object({ advice: z.string() })
    },
    async (input) => {
        return { advice: "Gunakan semen lokal untuk menghemat budget. Angka final dihitung oleh core-engine, bukan LLM." };
    }
);
''',
    f'{base_dir}/src/flows/estimate-reviewer.flow.ts': '''import { defineFlow } from "@genkit-ai/flow";
import { z } from "zod";

export const estimateReviewerFlow = defineFlow(
    {
        name: "estimateReviewerFlow",
        inputSchema: z.object({ rabId: z.string() }),
        outputSchema: z.object({ review: z.string() })
    },
    async (input) => {
        return { review: "Harga besi terlalu tinggi 15% dari standar. Angka final dihitung oleh core-engine, bukan LLM." };
    }
);
''',
    f'{base_dir}/src/flows/drawing-understanding.flow.ts': '''import { defineFlow } from "@genkit-ai/flow";
import { z } from "zod";

export const drawingUnderstandingFlow = defineFlow(
    {
        name: "drawingUnderstandingFlow",
        inputSchema: z.object({ imageId: z.string() }),
        outputSchema: z.object({ description: z.string() })
    },
    async (input) => {
        return { description: "Denah lantai 1 dengan 3 kamar tidur." };
    }
);
''',
    f'{base_dir}/src/flows/schedule-advisor.flow.ts': '''import { defineFlow } from "@genkit-ai/flow";
import { z } from "zod";

export const scheduleAdvisorFlow = defineFlow(
    {
        name: "scheduleAdvisorFlow",
        inputSchema: z.object({ scheduleId: z.string() }),
        outputSchema: z.object({ advice: z.string() })
    },
    async (input) => {
        return { advice: "Pertimbangkan overlap pekerjaan struktur dan arsitektur." };
    }
);
''',
    f'{base_dir}/src/flows/site-agent-report.flow.ts': '''import { defineFlow } from "@genkit-ai/flow";
import { z } from "zod";

export const siteAgentReportFlow = defineFlow(
    {
        name: "siteAgentReportFlow",
        inputSchema: z.object({ projectId: z.string(), date: z.string() }),
        outputSchema: z.object({ summary: z.string() })
    },
    async (input) => {
        return { summary: "Pengecoran berjalan lancar hari ini." };
    }
);
''',
    f'{base_dir}/src/tools/get-project-context.tool.ts': '''import { defineTool } from "@genkit-ai/ai/tool";
import { z } from "zod";

export const getProjectContextTool = defineTool(
    {
        name: "getProjectContext",
        description: "Get project background and details",
        inputSchema: z.object({ projectId: z.string() }),
        outputSchema: z.object({ context: z.string() })
    },
    async (input) => {
        return { context: "Proyek pembangunan rumah 2 lantai di Jakarta." };
    }
);
''',
    f'{base_dir}/src/tools/get-rab.tool.ts': '''import { defineTool } from "@genkit-ai/ai/tool";
import { z } from "zod";

export const getRabTool = defineTool(
    {
        name: "getRab",
        description: "Fetch current RAB data",
        inputSchema: z.object({ rabId: z.string() }),
        outputSchema: z.object({ data: z.any() })
    },
    async (input) => {
        return { data: { id: input.rabId, total: 500000000 } };
    }
);
''',
    f'{base_dir}/src/tools/edit-rab-draft.tool.ts': '''import { defineTool } from "@genkit-ai/ai/tool";
import { z } from "zod";

export const editRabDraftTool = defineTool(
    {
        name: "editRabDraft",
        description: "Edit RAB items",
        inputSchema: z.object({ rabId: z.string(), items: z.array(z.any()) }),
        outputSchema: z.object({ status: z.string() })
    },
    async (input) => {
        return { status: "success" };
    }
);
''',
    f'{base_dir}/src/tools/recalculate-rab.tool.ts': '''import { defineTool } from "@genkit-ai/ai/tool";
import { z } from "zod";

export const recalculateRabTool = defineTool(
    {
        name: "recalculateRab",
        description: "Call core-engine to recalculate RAB",
        inputSchema: z.object({ rabId: z.string() }),
        outputSchema: z.object({ newTotal: z.number() })
    },
    async (input) => {
        return { newTotal: 510000000 };
    }
);
''',
    f'{base_dir}/src/tools/generate-schedule.tool.ts': '''import { defineTool } from "@genkit-ai/ai/tool";
import { z } from "zod";

export const generateScheduleTool = defineTool(
    {
        name: "generateSchedule",
        description: "Generate project schedule",
        inputSchema: z.object({ projectId: z.string() }),
        outputSchema: z.object({ scheduleId: z.string() })
    },
    async (input) => {
        return { scheduleId: "sch-123" };
    }
);
''',
    f'{base_dir}/src/tools/analyze-drawing.tool.ts': '''import { defineTool } from "@genkit-ai/ai/tool";
import { z } from "zod";

export const analyzeDrawingTool = defineTool(
    {
        name: "analyzeDrawing",
        description: "Send drawing to document intelligence",
        inputSchema: z.object({ fileId: z.string() }),
        outputSchema: z.object({ summary: z.string() })
    },
    async (input) => {
        return { summary: "Analysis complete." };
    }
);
''',
    f'{base_dir}/src/tools/export-excel.tool.ts': '''import { defineTool } from "@genkit-ai/ai/tool";
import { z } from "zod";

export const exportExcelTool = defineTool(
    {
        name: "exportExcel",
        description: "Export data to Excel",
        inputSchema: z.object({ projectId: z.string(), type: z.string() }),
        outputSchema: z.object({ url: z.string() })
    },
    async (input) => {
        return { url: "https://example.com/export.xlsx" };
    }
);
''',
    f'{base_dir}/src/agents/engineering-agent.ts': '''export class EngineeringAgent {
    public async handleChat(input: string) {
        return "Chat handled";
    }
}
''',
    f'{base_dir}/src/agents/estimator-agent.ts': '''export class EstimatorAgent {
    public async advise() {
        return "Estimator advice";
    }
}
''',
    f'{base_dir}/src/agents/scheduler-agent.ts': '''export class SchedulerAgent {
    public async advise() {
        return "Scheduler advice";
    }
}
''',
    f'{base_dir}/src/agents/validation-agent.ts': '''export class ValidationAgent {
    public async validate() {
        return "Validation done";
    }
}
''',
    f'{base_dir}/src/prompts/system/engineering-chat.prompt.ts': '''export const engineeringChatPrompt = Anda adalah PAAX AI, asisten teknik sipil profesional di Indonesia.
Bantu pengguna dengan masalah proyek konstruksi mereka.;
''',
    f'{base_dir}/src/prompts/system/rab-advisor.prompt.ts': '''export const rabAdvisorPrompt = Anda adalah Estimator AI.
Berikan masukan tentang RAB yang diberikan pengguna.;
''',
    f'{base_dir}/src/prompts/system/drawing-reader.prompt.ts': '''export const drawingReaderPrompt = Anda ahli membaca gambar teknik.;
''',
    f'{base_dir}/src/prompts/system/site-agent.prompt.ts': '''export const siteAgentPrompt = Anda adalah pengawas lapangan (Site Agent).;
''',
    f'{base_dir}/src/prompts/few-shot/rab-review-examples.ts': '''export const rabReviewExamples = [
    { input: "Besi 12mm Rp 200.000", output: "Terlalu mahal, standar Rp 150.000" }
];
''',
    f'{base_dir}/src/prompts/few-shot/schedule-advice-examples.ts': '''export const scheduleAdviceExamples = [
    { input: "Pondasi 30 hari", output: "Bisa dipercepat menjadi 21 hari dengan tambah tenaga" }
];
''',
    f'{base_dir}/src/schemas/chat-schemas.ts': '''import { z } from "zod";
export const ChatMessageSchema = z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string()
});
''',
    f'{base_dir}/src/schemas/rab-schemas.ts': '''import { z } from "zod";
export const RabItemSchema = z.object({
    id: z.string(),
    uraianPekerjaan: z.string(),
    satuan: z.string(),
    volume: z.number(),
    hargaSatuan: z.number()
});
''',
    f'{base_dir}/src/schemas/drawing-schemas.ts': '''import { z } from "zod";
export const DrawingSchema = z.object({
    id: z.string(),
    url: z.string(),
    type: z.string()
});
''',
    f'{base_dir}/src/lib/model-router.ts': '''export function routeModel(taskComplexity: string) {
    if (taskComplexity === "high") return "gemini-1.5-pro";
    return "gemini-1.5-flash";
}
''',
    f'{base_dir}/src/lib/context-builder.ts': '''export function buildContext(projectId: string) {
    return "Project context string";
}
''',
    f'{base_dir}/src/lib/tool-executor.ts': '''export async function executeTool(toolName: string, args: any) {
    return { success: true };
}
''',
    f'{base_dir}/package.json': '''{
  "name": "@paax/ai-orchestrator",
  "version": "0.3.0",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "@genkit-ai/core": "^1.0.0",
    "@genkit-ai/flow": "^1.0.0",
    "@genkit-ai/googleai": "^1.0.0",
    "zod": "^3.22.4"
  },
  "devDependencies": {
    "typescript": "^5.0.0"
  }
}
''',
    f'{base_dir}/tsconfig.json': '''{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true
  }
}
''',
    f'{base_dir}/Dockerfile': '''FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
CMD ["npm", "start"]
''',
    f'{base_dir}/README.md': '''# PAAX AI Orchestrator
Genkit-based orchestrator for coordinating LLM agents and tools.
'''
}

for path, content in files.items():
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
