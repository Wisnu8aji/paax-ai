export const CORE_ENGINE_URL = process.env.NEXT_PUBLIC_CORE_ENGINE_URL || 'http://127.0.0.1:8081';

export class CoreEngineError extends Error {
  constructor(public message: string, public status?: number, public data?: any) {
    super(message);
    this.name = 'CoreEngineError';
  }
}

async function fetchClient<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  try {
    const url = `${CORE_ENGINE_URL}${endpoint}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      throw new CoreEngineError(
        `API Error: ${response.status} ${response.statusText}`,
        response.status,
        errorData
      );
    }

    return response.json() as Promise<T>;
  } catch (error) {
    if (error instanceof CoreEngineError) {
      throw error;
    }
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new CoreEngineError('Request timeout. Core Engine is taking too long to respond.', 408);
    }
    throw new CoreEngineError(`Network Error: Make sure Core Engine is running at ${CORE_ENGINE_URL}`);
  }
}

// ---------------------------------------------------------
// Types mapping Pydantic models
// ---------------------------------------------------------

// Health
export interface HealthResponse {
  status: string;
  version: string;
}

// RAB Models
export interface GenerateRABRequest {
  project_id: string;
  project_type: string;
  luas_bangunan: number;
  jumlah_lantai: number;
  lokasi: string;
  kelas_bangunan: string;
}

export interface RABItem {
  id?: string;
  kode: string;
  uraian: string;
  satuan: string;
  volume: number;
  harga_satuan: number;
  jumlah?: number;
  kategori?: string;
  catatan?: string | null;
  locked?: boolean;
}

export interface RABGroup {
  id?: string;
  nama: string;
  kategori: string;
  items: RABItem[];
  subtotal?: number;
}

export interface RABSummary {
  subtotal: number;
  ppn_rate: number;
  ppn: number;
  contingency_rate: number;
  contingency: number;
  overhead_profit_rate: number;
  overhead_profit: number;
  grand_total: number;
}

export interface RABVersion {
  id: string;
  project_id: string;
  version: number;
  label: string;
  groups: RABGroup[];
  summary: RABSummary;
  created_at?: string;
  updated_at?: string;
}

export interface RecalculateRABRequest {
  project_id: string;
  groups: RABGroup[];
  ppn_rate?: number;
  contingency_rate?: number;
  overhead_profit_rate?: number;
}

export interface ReviewRABRequest {
  project_id: string;
  groups: RABGroup[];
}

export interface RABWarning {
  severity: 'info' | 'warning' | 'error';
  code: string;
  message: string;
  item_id?: string;
  suggestion?: string;
}

export interface ReviewRABResponse {
  project_id: string;
  warnings: RABWarning[];
  score: number;
}

export interface OptimizeRABRequest {
  project_id: string;
  groups: RABGroup[];
  target_reduction_pct?: number;
}

export interface OptimizeRABResponse {
  project_id: string;
  original_total: number;
  optimized_total: number;
  savings: number;
  savings_pct: number;
  groups: RABGroup[];
  changes: string[];
}

// Schedule Models
export interface ScenarioRequest {
  project_id: string;
  scenario?: 'hemat' | 'normal' | 'cepat' | 'recovery';
  luas_bangunan: number;
  jumlah_lantai: number;
  start_date: string;
}

export interface ScheduleTask {
  id?: string;
  wbs: string;
  nama: string;
  durasi_hari: number;
  start_date: string;
  end_date: string;
  predecessor?: string | null;
  progress_pct?: number;
  status?: 'not_started' | 'in_progress' | 'completed' | 'delayed' | 'on_hold';
  bobot_pct?: number;
  resources?: string[];
}

export interface ScheduleVersion {
  id: string;
  project_id: string;
  version: number;
  scenario: string;
  label: string;
  tasks: ScheduleTask[];
  total_durasi_hari: number;
  start_date: string;
  end_date: string;
  created_at?: string;
}

export interface DelayRecoveryRequest {
  project_id: string;
  tasks: ScheduleTask[];
  current_date: string;
  target_end_date: string;
}

export interface DelayRecoveryResponse {
  project_id: string;
  total_delay_days: number;
  delays: any[];
  recovery_actions: any[];
  recovered_tasks: ScheduleTask[];
  new_end_date: string;
  feasible: boolean;
}

// Export Models
export interface ExportRequest {
  project_id: string;
  export_type: 'rab' | 'schedule' | 'audit';
  data: any;
}

// Validation Models
export interface ValidationRequest {
  project_id: string;
  rab_data: any;
  schedule_data: any;
}

export interface ValidationResponse {
  status: string;
  errors: string[];
  warnings: string[];
}

// ---------------------------------------------------------
// API Client Functions
// ---------------------------------------------------------

export const CoreEngineAPI = {
  health: () => fetchClient<HealthResponse>('/health'),
  
  rab: {
    generate: (data: GenerateRABRequest) => 
      fetchClient<RABVersion>('/rab/generate', { method: 'POST', body: JSON.stringify(data) }),
    recalculate: (data: RecalculateRABRequest) => 
      fetchClient<RABSummary>('/rab/recalculate', { method: 'POST', body: JSON.stringify(data) }),
    review: (data: ReviewRABRequest) => 
      fetchClient<ReviewRABResponse>('/rab/review', { method: 'POST', body: JSON.stringify(data) }),
    optimize: (data: OptimizeRABRequest) => 
      fetchClient<OptimizeRABResponse>('/rab/optimize', { method: 'POST', body: JSON.stringify(data) }),
  },

  schedule: {
    generate: (data: ScenarioRequest) => 
      fetchClient<ScheduleVersion>('/schedule/generate', { method: 'POST', body: JSON.stringify(data) }),
    scenario: (data: ScenarioRequest) => 
      fetchClient<ScheduleVersion[]>('/schedule/scenario', { method: 'POST', body: JSON.stringify(data) }),
    delayRecovery: (data: DelayRecoveryRequest) => 
      fetchClient<DelayRecoveryResponse>('/schedule/delay-recovery', { method: 'POST', body: JSON.stringify(data) }),
  },

  export: {
    excel: (data: ExportRequest) => 
      fetchClient<{status: string; url: string}>('/export/excel', { method: 'POST', body: JSON.stringify(data) }),
  },

  validation: {
    run: (data: ValidationRequest) => 
      fetchClient<ValidationResponse>('/validation/run', { method: 'POST', body: JSON.stringify(data) }),
  }
};
