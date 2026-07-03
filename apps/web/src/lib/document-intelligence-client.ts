import { DocumentIntelligenceHealth, DrawingAnalysisResult } from "@paax/types";
import type { TkgDocument, TkgValidationResult } from "@paax/schemas";

const BASE_URL = process.env.NEXT_PUBLIC_DOCUMENT_INTELLIGENCE_URL || "http://127.0.0.1:8083";

export interface DrawingFileMetadata {
  file_id?: string;
  file_name: string;
  file_type: string;
  project_id?: string;
}

export interface VerifyCandidatePayload {
  candidate_id: string;
  status: "APPROVED" | "REJECTED" | "EDITED";
  verified_value?: number;
  notes?: string;
}

export interface TkgPerceptionLocator {
  page?: number;
  bbox?: number[];
}

export interface TkgPerceptionWarning extends TkgPerceptionLocator {
  code: string;
  message: string;
}

export interface TkgPerceptionUnclassified extends TkgPerceptionLocator {
  raw: string;
  alasan: string;
}

export interface TkgPerceptionResult {
  tkg: TkgDocument;
  validation: TkgValidationResult;
  metrics: {
    span_total: number;
    span_terklasifikasi: number;
    cakupan: number;
    grammar_pass_rate: number;
    n_unclassified: number;
    n_warning: number;
  };
  gerbang: {
    status: "draft" | "lolos";
    checks: Array<{ code: string; label: string; passed: boolean }>;
  };
  warnings?: TkgPerceptionWarning[];
  unclassified?: TkgPerceptionUnclassified[];
  tkg_txt: string;
}

export class DocumentIntelligenceClient {
  private static async fetchApi<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    try {
      const response = await fetch(`${BASE_URL}${endpoint}`, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          ...options.headers,
        },
      });

      if (!response.ok) {
        throw new Error(`API Error: ${response.status} ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`Document Intelligence API Error (${endpoint}):`, error);
      throw error;
    }
  }

  static async getHealth(): Promise<DocumentIntelligenceHealth> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      
      const response = await fetch(`${BASE_URL}/health`, {
        signal: controller.signal,
        headers: { "Content-Type": "application/json" }
      });
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error("Health check failed");
      }
      return await response.json();
    } catch (e) {
      // Graceful fallback without console.error to avoid Next.js dev overlay
      return {
        status: "offline",
        service: "document-intelligence",
        version: "unknown",
        mode: "fallback_demo",
        ai_provider_configured: false,
      };
    }
  }

  static async analyzeDrawing(fileMetadata: DrawingFileMetadata): Promise<DrawingAnalysisResult> {
    return this.fetchApi<DrawingAnalysisResult>("/drawings/analyze", {
      method: "POST",
      body: JSON.stringify({ file_metadata: fileMetadata }),
    });
  }

  static async classifyDrawing(fileMetadata: DrawingFileMetadata): Promise<{ classification: string; confidence: number }> {
    return this.fetchApi<{ classification: string; confidence: number }>("/drawings/classify", {
      method: "POST",
      body: JSON.stringify({ file_metadata: fileMetadata }),
    });
  }

  static async extractDrawing(fileMetadata: DrawingFileMetadata): Promise<DrawingAnalysisResult> {
    return this.fetchApi<DrawingAnalysisResult>("/drawings/extract", {
      method: "POST",
      body: JSON.stringify({ file_metadata: fileMetadata }),
    });
  }

  static async verifyCandidate(payload: VerifyCandidatePayload): Promise<any> {
    return this.fetchApi<any>("/drawings/verify", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  static async getBoqPreview(verifiedQuantities: any[]): Promise<{ status: string; draft_items: any[] }> {
    return this.fetchApi<{ status: string; draft_items: any[] }>("/drawings/boq-preview", {
      method: "POST",
      body: JSON.stringify({ verified_quantities: verifiedQuantities }),
    });
  }

  static async perceiveTkg(file: File, projectId: string): Promise<TkgPerceptionResult> {
    const form = new FormData();
    form.append("file", file);
    form.append("project_id", projectId);

    // TODO: sambung P4 saat endpoint kontrak final sudah merge.
    const response = await fetch(`${BASE_URL}/drawings/tkg/perceive`, {
      method: "POST",
      body: form,
    });

    if (!response.ok) {
      const err = (await response.json().catch(() => null)) as { detail?: string; error?: string } | null;
      throw new Error(err?.detail ?? err?.error ?? `API Error: ${response.status} ${response.statusText}`);
    }

    return response.json() as Promise<TkgPerceptionResult>;
  }
}
