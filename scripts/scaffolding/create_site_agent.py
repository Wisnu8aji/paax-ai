import os

base_dir = 'services/site-agent'

files = {
    f'{base_dir}/src/index.ts': '''import { generateMorningReport } from "./reports/morning-report";
import { generateEveningReport } from "./reports/evening-report";

console.log("Site Agent Service initialized");
''',
    f'{base_dir}/src/reports/morning-report.ts': '''export function generateMorningReport(projectId: string) {
    return {
        todayTasks: ["Pengecoran plat lantai 2", "Pembesian kolom"],
        materialNeeds: ["Semen 50 sak", "Besi 12mm 100 batang"],
        crewAllocation: ["Tukang 10 orang", "Knek 15 orang"],
        riskAlerts: ["Kemungkinan hujan sore hari, siapkan terpal"]
    };
}
''',
    f'{base_dir}/src/reports/evening-report.ts': '''export function generateEveningReport(projectId: string) {
    return {
        plannedVsActual: "Pengecoran selesai 80% dari target",
        costDeviation: "Biaya lembur tukang +Rp 500.000",
        issues: ["Keterlambatan material pasir"],
        nextDayPrep: ["Koordinasi dengan supplier pasir pagi hari"]
    };
}
''',
    f'{base_dir}/src/reports/weekly-summary.ts': '''export function generateWeeklySummary(projectId: string) {
    return {
        progress: "15% selesai",
        budget: "Sesuai rencana RAB"
    };
}
''',
    f'{base_dir}/src/analysis/progress-vs-schedule.ts': '''export function compareProgress(actual: number, planned: number) {
    if (actual < planned) return "Terlambat";
    if (actual > planned) return "Lebih Cepat";
    return "Sesuai Jadwal";
}
''',
    f'{base_dir}/src/analysis/cost-vs-rab.ts': '''export function compareCost(actual: number, rab: number) {
    if (actual > rab) return "Overbudget";
    return "Under budget atau Sesuai";
}
''',
    f'{base_dir}/src/analysis/next-action.ts': '''export function recommendNextActions(issues: string[]) {
    return issues.map(i => Segera selesaikan: );
}
''',
    f'{base_dir}/src/schemas/site-schemas.ts': '''import { z } from "zod";

export const MorningReportSchema = z.object({
    todayTasks: z.array(z.string()),
    materialNeeds: z.array(z.string()),
    crewAllocation: z.array(z.string()),
    riskAlerts: z.array(z.string())
});

export const EveningReportSchema = z.object({
    plannedVsActual: z.string(),
    costDeviation: z.string(),
    issues: z.array(z.string()),
    nextDayPrep: z.array(z.string())
});
''',
    f'{base_dir}/src/lib/data-fetcher.ts': '''export async function fetchProjectData(projectId: string) {
    return { id: projectId, name: "Proyek Demo" };
}
''',
    f'{base_dir}/src/lib/alert-generator.ts': '''export function generateAlert(message: string) {
    console.warn(ALERT: );
}
''',
    f'{base_dir}/package.json': '''{
  "name": "@paax/site-agent",
  "version": "0.3.0",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js"
  },
  "dependencies": {
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
    f'{base_dir}/README.md': '''# PAAX Site Agent
TypeScript service for generating morning/evening reports and analyzing site progress.
'''
}

for path, content in files.items():
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
