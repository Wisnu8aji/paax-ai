import { DocumentIntelligenceHealth, DrawingAnalysisResult } from "@paax/types";

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
}
