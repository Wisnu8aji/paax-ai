import { z } from "zod";

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
