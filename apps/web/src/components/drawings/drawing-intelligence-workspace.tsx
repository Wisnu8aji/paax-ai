"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { DocumentIntelligenceClient, DrawingFileMetadata } from "@/lib/document-intelligence-client";
import { DocumentIntelligenceHealth, DrawingAnalysisResult, QuantityCandidate, BoqDraftItem, DrawingToRabContext } from "@paax/types";
import { DRAWING_STORAGE_KEYS, LocalStorage, projectStorageKey } from "@/lib/local-storage";
import { Bot, FileText, CheckCircle2, AlertTriangle, Play, Save, Check, X, ArrowRight } from "lucide-react";

interface DrawingIntelligenceWorkspaceProps {
  projectId?: string;
}

export function DrawingIntelligenceWorkspace({ projectId = "demo-project" }: DrawingIntelligenceWorkspaceProps) {
  const router = useRouter();
  const [health, setHealth] = useState<DocumentIntelligenceHealth | null>(null);
  const [fileName, setFileName] = useState("Denah_Lantai_1.pdf");
  const [fileType, setFileType] = useState("DRAWING_PDF");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<DrawingAnalysisResult | null>(null);
  const [verifiedQuantities, setVerifiedQuantities] = useState<QuantityCandidate[]>([]);
  const [boqDraft, setBoqDraft] = useState<BoqDraftItem[]>([]);
  const [isGeneratingBoq, setIsGeneratingBoq] = useState(false);

  useEffect(() => {
    DocumentIntelligenceClient.getHealth().then(setHealth);
    
    // Load existing state from localStorage if any
    const savedContext = LocalStorage.get<DrawingToRabContext | null>(
      projectStorageKey(DRAWING_STORAGE_KEYS.CONTEXT, projectId),
      null,
    );
    const savedAnalysis = LocalStorage.get<DrawingAnalysisResult | null>(
      projectStorageKey(DRAWING_STORAGE_KEYS.ANALYSIS, projectId),
      null,
    );
    const savedBoqDraft = LocalStorage.get<BoqDraftItem[]>(
      projectStorageKey(DRAWING_STORAGE_KEYS.BOQ_DRAFT, projectId),
      [],
    );
    if (savedContext && savedContext.analysis_result) {
      setAnalysisResult(savedContext.analysis_result);
      setVerifiedQuantities(savedContext.verified_quantities || []);
      setBoqDraft(savedContext.boq_draft_items || []);
    } else {
      setAnalysisResult(savedAnalysis);
      setVerifiedQuantities(savedAnalysis?.quantity_candidates || []);
      setBoqDraft(savedBoqDraft);
    }
  }, [projectId]);

  const handleAnalyze = async () => {
    setIsAnalyzing(true);
    try {
      const metadata: DrawingFileMetadata = {
        file_name: fileName,
        file_type: fileType,
        project_id: projectId,
      };
      
      const result = await DocumentIntelligenceClient.analyzeDrawing(metadata);
      setAnalysisResult(result);
      LocalStorage.set(projectStorageKey(DRAWING_STORAGE_KEYS.ANALYSIS, projectId), result);
      
      // Initialize verification state
      setVerifiedQuantities(result.quantity_candidates || []);
      setBoqDraft([]);
    } catch (error) {
      console.error("Analysis failed", error);
      alert("Failed to analyze drawing. Check if the Document Intelligence service is running.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleVerify = (candidateId: string, status: "APPROVED" | "REJECTED", newValue?: number) => {
    setVerifiedQuantities(prev => {
      const updated = prev.map(c => {
      if (c.id === candidateId) {
        return {
          ...c,
          status,
          needs_verification: false,
          value: newValue !== undefined ? newValue : c.value
        };
      }
      return c;
      });
      if (analysisResult) {
        const updatedAnalysis = { ...analysisResult, quantity_candidates: updated };
        setAnalysisResult(updatedAnalysis);
        LocalStorage.set(projectStorageKey(DRAWING_STORAGE_KEYS.ANALYSIS, projectId), updatedAnalysis);
      }
      return updated;
    });
  };

  const handleGenerateBoqPreview = async () => {
    setIsGeneratingBoq(true);
    try {
      const approved = verifiedQuantities.filter(c => c.status === "APPROVED" || c.status === "EDITED");
      if (approved.length === 0) {
        alert("Please approve at least one quantity before generating a draft.");
        setIsGeneratingBoq(false);
        return;
      }
      
      const res = await DocumentIntelligenceClient.getBoqPreview(approved);
      setBoqDraft(res.draft_items);
      LocalStorage.set(projectStorageKey(DRAWING_STORAGE_KEYS.BOQ_DRAFT, projectId), res.draft_items);
    } catch (e) {
      console.error(e);
      alert("Failed to generate BOQ preview.");
    } finally {
      setIsGeneratingBoq(false);
    }
  };

  const handleHandoffToRab = () => {
    if (!analysisResult) return;
    
    const context: DrawingToRabContext = {
      project_id: projectId,
      drawing_file: fileName,
      analysis_result: analysisResult,
      verified_quantities: verifiedQuantities.filter(c => c.status === "APPROVED" || c.status === "EDITED"),
      boq_draft_items: boqDraft,
      warnings: analysisResult.warnings.map(w => w.message),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    LocalStorage.set(projectStorageKey(DRAWING_STORAGE_KEYS.CONTEXT, projectId), context);
    LocalStorage.set(projectStorageKey(DRAWING_STORAGE_KEYS.ANALYSIS, projectId), analysisResult);
    LocalStorage.set(projectStorageKey(DRAWING_STORAGE_KEYS.BOQ_DRAFT, projectId), boqDraft);
    
    // Save to files for the files dashboard
    const filesKey = projectStorageKey(DRAWING_STORAGE_KEYS.FILES, projectId);
    const existingFiles = LocalStorage.get<any[]>(filesKey, []);
    LocalStorage.set(filesKey, [...existingFiles, { name: fileName, type: fileType, project_id: projectId }]);
    
    router.push(`/proyek/${projectId}/rab`);
  };

  return (
    <div className="flex-1 space-y-6 max-w-[1400px]">
      <div className="flex items-center justify-between space-y-2">
        <div>
          <h2 className="text-2xl font-bold text-white">Gambar Kerja AI</h2>
          <p className="text-paax-text-muted text-sm mt-1">Upload, analyze, verify, and prepare drawing data for BOQ/RAB</p>
        </div>
        <div className="flex items-center space-x-2">
          {health?.status === "ok" ? (
            <span className="badge badge-green text-sm px-3 py-1">
              Service Online ({health.mode === "real_ai" ? "Gemini AI" : "Demo Fallback"})
            </span>
          ) : (
            <span className="badge badge-red text-sm px-3 py-1">Service Offline</span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-4 gap-3">
        <div className="stat-card py-3 px-4">
          <div className="text-[10px] text-paax-text-muted uppercase tracking-wider mb-1 flex items-center justify-between">
            Drawing Files <FileText className="h-3 w-3" />
          </div>
          <div className="text-[15px] font-bold text-white">{analysisResult ? "1" : "0"}</div>
          <p className="text-[10px] text-paax-text-muted">Uploaded & Processed</p>
        </div>
        <div className="stat-card py-3 px-4">
          <div className="text-[10px] text-paax-text-muted uppercase tracking-wider mb-1 flex items-center justify-between">
            Approved Quantities <CheckCircle2 className="h-3 w-3 text-emerald-500" />
          </div>
          <div className="text-[15px] font-bold text-white">
            {verifiedQuantities.filter(q => !q.needs_verification && q.status !== "REJECTED").length}
          </div>
          <p className="text-[10px] text-paax-text-muted">Ready for BOQ Draft</p>
        </div>
        <div className="stat-card py-3 px-4">
          <div className="text-[10px] text-paax-text-muted uppercase tracking-wider mb-1 flex items-center justify-between">
            Draft BOQ Items <Save className="h-3 w-3 text-blue-500" />
          </div>
          <div className="text-[15px] font-bold text-white">{boqDraft.length}</div>
          <p className="text-[10px] text-paax-text-muted">Generated from drawings</p>
        </div>
        <div className="stat-card py-3 px-4">
          <div className="text-[10px] text-paax-text-muted uppercase tracking-wider mb-1 flex items-center justify-between">
            Drawing Warnings <AlertTriangle className="h-3 w-3 text-amber-500" />
          </div>
          <div className="text-[15px] font-bold text-white">{analysisResult?.warnings.length || 0}</div>
          <p className="text-[10px] text-paax-text-muted">Requires attention</p>
        </div>
      </div>

      <div className="grid gap-6 grid-cols-1 md:grid-cols-3">
        {/* Intake Panel */}
        <div className="col-span-1 glass-card p-5 border border-white/[0.05] rounded-xl flex flex-col h-full">
          <h3 className="text-lg font-semibold text-white mb-1">Drawing Intake</h3>
          <p className="text-xs text-paax-text-muted mb-6">Upload construction drawings for AI analysis</p>
          
          <div className="space-y-4 flex-1">
            <div className="space-y-1">
              <label className="text-[12px] font-medium text-paax-text-secondary">File Name</label>
              <input type="text" value={fileName} onChange={(e) => setFileName(e.target.value)} className="input-field" />
            </div>
            <div className="space-y-1">
              <label className="text-[12px] font-medium text-paax-text-secondary">File Type</label>
              <select value={fileType} onChange={(e) => setFileType(e.target.value)} className="input-field appearance-none">
                <option value="DRAWING_PDF">PDF Gambar Kerja</option>
                <option value="DWG_PDF">DWG to PDF</option>
                <option value="IMAGE">Foto / Scan</option>
              </select>
            </div>
            
            <div className="rounded-md border border-dashed border-white/[0.2] bg-white/[0.02] flex flex-col items-center justify-center h-40 text-center">
              <FileText className="h-8 w-8 text-paax-text-muted mb-2" />
              <p className="text-sm font-medium text-white">Mock File Upload</p>
              <p className="text-xs text-paax-text-muted">For v0.5, file upload is simulated</p>
            </div>
          </div>
          
          <div className="pt-4 mt-auto">
            <button className="btn-primary w-full justify-center" onClick={handleAnalyze} disabled={isAnalyzing || health?.status !== "ok"}>
              {isAnalyzing ? (
                <>Analyzing...</>
              ) : (
                <>
                  <Bot className="mr-2 h-4 w-4" />
                  Analyze Drawing
                </>
              )}
            </button>
            {health?.mode === "fallback_demo" && (
              <p className="text-xs text-amber-500 text-center flex items-center justify-center mt-3">
                <AlertTriangle className="h-3 w-3 mr-1" />
                Demo fallback mode active (No API Key)
              </p>
            )}
          </div>
        </div>

        {/* Results Panel */}
        <div className="col-span-1 md:col-span-2 glass-card p-5 border border-white/[0.05] rounded-xl flex flex-col h-full">
          <h3 className="text-lg font-semibold text-white mb-1">Extraction & Verification</h3>
          <p className="text-xs text-paax-text-muted mb-6">Review and approve quantity candidates</p>
          
          {!analysisResult ? (
            <div className="flex-1 flex h-[300px] items-center justify-center text-paax-text-muted border border-white/[0.05] rounded-md bg-white/[0.02]">
              Submit a drawing to see extraction results
            </div>
          ) : (
            <div className="space-y-6 flex-1 flex flex-col">
              {/* Meta */}
              <div className="flex gap-2 flex-wrap">
                <span className="badge badge-blue">Classification: {analysisResult.classification}</span>
                <span className="badge badge-slate">{analysisResult.rooms.length} Rooms</span>
                <span className="badge badge-slate">{analysisResult.doors.length} Doors</span>
                <span className="badge badge-slate">{analysisResult.windows.length} Windows</span>
              </div>
              
              {/* Warnings */}
              {analysisResult.warnings.length > 0 && (
                <div className="bg-amber-500/10 border border-amber-500/20 text-amber-500 p-4 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="h-4 w-4" />
                    <h4 className="text-sm font-semibold">Drawing Warnings ({analysisResult.warnings.length})</h4>
                  </div>
                  <ul className="list-disc pl-5 text-xs space-y-1">
                    {analysisResult.warnings.slice(0, 3).map((w, i) => (
                      <li key={i}>{w.message}</li>
                    ))}
                    {analysisResult.warnings.length > 3 && <li>And {analysisResult.warnings.length - 3} more...</li>}
                  </ul>
                </div>
              )}

              {/* Verification List */}
              <div className="flex-1 min-h-0 flex flex-col">
                <h4 className="text-sm font-medium text-white mb-3">Quantity Candidates (Mandatory Verification)</h4>
                <div className="border border-white/[0.1] rounded-md overflow-y-auto flex-1 max-h-[300px]">
                  {verifiedQuantities.map((candidate) => (
                    <div key={candidate.id} className={`p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-white/[0.05] last:border-0 ${
                      candidate.status === 'APPROVED' ? 'bg-emerald-500/5' : 
                      candidate.status === 'REJECTED' ? 'bg-red-500/5 opacity-70' : 'bg-white/[0.02]'
                    }`}>
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm text-white">{candidate.quantity_name}</span>
                          <span className="text-[10px] text-paax-text-muted border border-white/10 px-1.5 py-0.5 rounded">{Math.round(candidate.confidence * 100)}% Conf.</span>
                          {candidate.status === 'APPROVED' && <span className="badge badge-green text-[10px]">Verified</span>}
                          {candidate.status === 'REJECTED' && <span className="badge badge-red text-[10px]">Rejected</span>}
                        </div>
                        <p className="text-xs text-paax-text-muted">{candidate.evidence_note}</p>
                        <div className="text-sm font-semibold text-indigo-400">
                          {candidate.value} {candidate.unit}
                        </div>
                      </div>
                      
                      {candidate.needs_verification && (
                        <div className="flex gap-2 w-full md:w-auto">
                          <button className="flex-1 md:flex-none px-3 py-1.5 text-xs font-medium text-emerald-400 bg-emerald-400/10 hover:bg-emerald-400/20 rounded border border-emerald-400/20 transition-colors flex items-center justify-center gap-1" onClick={() => handleVerify(candidate.id, 'APPROVED')}>
                            <Check className="h-3 w-3" /> Approve
                          </button>
                          <button className="flex-1 md:flex-none px-3 py-1.5 text-xs font-medium text-red-400 bg-red-400/10 hover:bg-red-400/20 rounded border border-red-400/20 transition-colors flex items-center justify-center gap-1" onClick={() => handleVerify(candidate.id, 'REJECTED')}>
                            <X className="h-3 w-3" /> Reject
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* BOQ Draft & Handoff */}
      {analysisResult && (
        <div className="glass-card p-6 border border-white/[0.05] rounded-xl mt-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
            <div>
              <h3 className="text-lg font-semibold text-white mb-1">BOQ Draft & RAB Handoff</h3>
              <p className="text-xs text-paax-text-muted">Prepare the verified quantities for deterministic cost calculation</p>
            </div>
            <div className="flex gap-3 w-full md:w-auto">
              <button onClick={handleGenerateBoqPreview} disabled={isGeneratingBoq || verifiedQuantities.filter(c => !c.needs_verification && c.status !== 'REJECTED').length === 0} className="btn-secondary w-full md:w-auto justify-center">
                <Play className="h-4 w-4" /> Generate BOQ Draft Preview
              </button>
              <button onClick={handleHandoffToRab} className="btn-primary w-full md:w-auto justify-center">
                Use Verified Data for RAB <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
          
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 mb-6">
            <h4 className="text-sm font-semibold text-blue-400">Core Engine Principle</h4>
            <p className="text-xs text-blue-200/70 mt-1">
              This preview is a draft. The AI does not generate final RAB numbers. The Core Engine will perform all final deterministic calculations based on these verified quantities and your project&apos;s pricing profile.
            </p>
          </div>

          {boqDraft.length > 0 && (
            <div className="border border-white/[0.1] rounded-md overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-white/[0.03] border-b border-white/[0.1]">
                  <tr>
                    <th className="p-3 font-medium text-paax-text-secondary">Category</th>
                    <th className="p-3 font-medium text-paax-text-secondary">Item Name</th>
                    <th className="p-3 font-medium text-paax-text-secondary text-right">Quantity</th>
                    <th className="p-3 font-medium text-paax-text-secondary">Unit</th>
                    <th className="p-3 font-medium text-paax-text-secondary text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.05]">
                  {boqDraft.map(item => (
                    <tr key={item.id} className="hover:bg-white/[0.02]">
                      <td className="p-3 text-paax-text-muted text-xs">{item.category}</td>
                      <td className="p-3 font-medium text-slate-200">{item.item_name}</td>
                      <td className="p-3 text-right font-mono text-indigo-300">{item.quantity}</td>
                      <td className="p-3 text-paax-text-muted">{item.unit}</td>
                      <td className="p-3 text-center">
                        <span className="badge badge-green text-[10px]">Ready</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
