export interface AhspComponent {
  key: string;
  name: string;
  coefficient: number;
  unit: string;
}

export interface AhspTemplate {
  code: string;
  name: string;
  unit: string;
  category: string;
  materials: AhspComponent[];
  labor: AhspComponent[];
}

export interface WorkItem {
  id: string;
  category: string;
  name: string;
  volume: number;
  unit: string;
  ahspCode: string;
  customUnitPrice?: number;
}

export interface CalculatedWorkItem extends WorkItem {
  unitCost: number;
  directCost: number;
  overheadCost: number;
  totalCost: number;
  materialCost: number;
  laborCost: number;
}

export interface ScheduleItem {
  id: string;
  taskName: string;
  startDate: string;
  durationDays: number;
  progress: number;
  dependencies: string[];
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

export interface DrawingItem {
  name: string;
  volume: number;
  unit: string;
  matchedAHSP: string;
}

export interface DrawingAnalysisResponse {
  analysis: string;
  estimatedCost: number;
  itemsGenerated: DrawingItem[];
}

export interface ProjectState {
  id: string;
  name: string;
  location: string;
  description: string;
  overheadPercentage: number;
  materialsPrices: Record<string, number>;
  laborPrices: Record<string, number>;
  workItems: WorkItem[];
  schedules: ScheduleItem[];
}
