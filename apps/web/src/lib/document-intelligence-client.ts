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
      return await this.fetchApi<DocumentIntelligenceHealth>("/health");
    } catch (e) {
      // Fallback if service is completely offline
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
