'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import {
  Calculator,
  Sparkles,
  Upload,
  RefreshCw,
  Eye,
  TrendingDown,
  Download,
  AlertTriangle,
  CheckCircle2,
  Clock,
  MoreHorizontal,
  Search,
  Filter,
  Info,
  XCircle,
  X
} from 'lucide-react';
import { CoreEngineAPI, RABVersion, GenerateRABRequest, RABWarning, RABSummary } from '@/lib/core-engine-client';
import { LocalStorage, STORAGE_KEYS } from '@/lib/local-storage';
import { formatRupiah } from '@/lib/format';
import { DrawingToRabContext } from '@paax/types';

export default function RABPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [activeTab, setActiveTab] = useState('RAB Detail');
  
  const [project, setProject] = useState<any>(null);
  const [rabData, setRabData] = useState<RABVersion | null>(null);
  const [warnings, setWarnings] = useState<RABWarning[]>([]);
  const [healthScore, setHealthScore] = useState(100);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingModalOpen, setIsGeneratingModalOpen] = useState(false);
  const [drawingContext, setDrawingContext] = useState<DrawingToRabContext | null>(null);
  
  const [generateForm, setGenerateForm] = useState({
    project_type: 'rumah_tinggal',
    luas_bangunan: 150,
    jumlah_lantai: 2,
    lokasi: 'jakarta',
    kelas_bangunan: 'menengah'
  });

  useEffect(() => {
    // Load Project
    const savedProjects = LocalStorage.get<any[]>(STORAGE_KEYS.PROJECTS, []);
    const found = savedProjects.find(p => p.id === projectId);
    if (found) setProject(found);

    // Load RAB
    const savedRabs = LocalStorage.get<Record<string, RABVersion>>(STORAGE_KEYS.RAB_DATA, {});
    if (savedRabs[projectId]) {
      setRabData(savedRabs[projectId]);
    }

    // Load Drawing Context
    const savedContext = LocalStorage.get<DrawingToRabContext | null>("paax_drawing_to_rab_context", null);
    if (savedContext && (savedContext.project_id === projectId || savedContext.project_id === "demo-project")) {
      setDrawingContext(savedContext);
    }
  }, [projectId]);

  const saveRab = (data: RABVersion) => {
    setRabData(data);
    const savedRabs = LocalStorage.get<Record<string, RABVersion>>(STORAGE_KEYS.RAB_DATA, {});
    savedRabs[projectId] = data;
    LocalStorage.set(STORAGE_KEYS.RAB_DATA, savedRabs);

    // Update project RAB value
    if (project) {
      const updatedProject = { ...project, rabValue: data.summary.grand_total, status: 'rab-review' };
      const savedProjects = LocalStorage.get<any[]>(STORAGE_KEYS.PROJECTS, []);
      const index = savedProjects.findIndex(p => p.id === projectId);
      if (index !== -1) {
        savedProjects[index] = updatedProject;
        LocalStorage.set(STORAGE_KEYS.PROJECTS, savedProjects);
        setProject(updatedProject);
      }
    }
  };

  const handleGenerateRAB = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsGenerating(true);
    try {
      const req: GenerateRABRequest = {
        project_id: projectId,
        project_type: generateForm.project_type,
        luas_bangunan: generateForm.luas_bangunan,
        jumlah_lantai: generateForm.jumlah_lantai,
        lokasi: generateForm.lokasi,
        kelas_bangunan: generateForm.kelas_bangunan
      };
      const result = await CoreEngineAPI.rab.generate(req);
      saveRab(result);
      setIsGeneratingModalOpen(false);
      setActiveTab('RAB Detail');
      setWarnings([]);
    } catch (error) {
      console.error("Failed to generate RAB", error);
      alert("Gagal generate RAB. Pastikan Core Engine berjalan.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRecalculate = async () => {
    if (!rabData) return;
    try {
      const result = await CoreEngineAPI.rab.recalculate({
        project_id: projectId,
        groups: rabData.groups
      });
      saveRab({ ...rabData, summary: result });
      alert("RAB berhasil dikalkulasi ulang");
    } catch (error) {
      console.error(error);
    }
  };

  const handleReview = async () => {
    if (!rabData) return;
    try {
      const result = await CoreEngineAPI.rab.review({
        project_id: projectId,
        groups: rabData.groups
      });
      setWarnings(result.warnings);
      setHealthScore(result.score);
      setActiveTab('Warnings');
      
      // Update Project Health Score
      if (project) {
        const updatedProject = { 
          ...project, 
          health: result.score, 
          warnings: result.warnings.filter(w => w.severity === 'error' || w.severity === 'warning').length 
        };
        const savedProjects = LocalStorage.get<any[]>(STORAGE_KEYS.PROJECTS, []);
        const index = savedProjects.findIndex(p => p.id === projectId);
        if (index !== -1) {
          savedProjects[index] = updatedProject;
          LocalStorage.set(STORAGE_KEYS.PROJECTS, savedProjects);
          setProject(updatedProject);
        }
      }
    } catch (error) {
      console.error(error);
      alert("Gagal me-review RAB.");
    }
  };

  const handleOptimize = async () => {
    if (!rabData) return;
    try {
      const targetStr = prompt("Target penghematan budget (dalam %)?", "10");
      if (!targetStr) return;
      const target = parseFloat(targetStr);
      const result = await CoreEngineAPI.rab.optimize({
        project_id: projectId,
        groups: rabData.groups,
        target_reduction_pct: target
      });
      
      const newSummary = await CoreEngineAPI.rab.recalculate({
        project_id: projectId,
        groups: result.groups
      });

      saveRab({ ...rabData, groups: result.groups, summary: newSummary });
      alert(`Optimasi selesai! Hemat ${formatRupiah(result.savings)} (${result.savings_pct}%).`);
    } catch (error) {
      console.error(error);
      alert("Gagal mengoptimasi RAB.");
    }
  };

  const flattenItems = () => {
    if (!rabData) return [];
    const flat: any[] = [];
    rabData.groups.forEach((group, index) => {
      flat.push({
        isHeader: true,
        kode: `G.${index + 1}`,
        uraian: group.nama.toUpperCase(),
        jumlah: group.subtotal,
      });
      group.items.forEach(item => {
        flat.push({
          isHeader: false,
          ...item
        });
      });
    });
    return flat;
  };

  const tabs = ['RAB Detail', 'Warnings', 'Assumptions'];

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'critical': return <span className="badge badge-red text-[9px]">Critical</span>;
      case 'warning': return <span className="badge badge-amber text-[9px]">Warning</span>;
      case 'info': return <span className="badge badge-blue text-[9px]">Info</span>;
      case 'error': return <span className="badge badge-red text-[9px]">Error</span>;
      default: return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Drawing Context Panel */}
      {drawingContext && (
        <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <Sparkles className="h-5 w-5 text-blue-400 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-blue-100">Verified Drawing Data Available</h3>
              <p className="text-xs text-blue-200/70 mt-1">
                Data extracted from <span className="font-medium text-blue-200">{drawingContext.drawing_file}</span> is ready. 
                This context includes {drawingContext.verified_quantities.length} verified quantities and {drawingContext.boq_draft_items.length} BOQ draft items.
              </p>
              <div className="mt-3 flex gap-2">
                <button onClick={() => setIsGeneratingModalOpen(true)} className="px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors">
                  Generate RAB using Drawing Data
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
        <div className="stat-card py-3 px-4">
          <div className="text-[10px] text-paax-text-muted uppercase tracking-wider mb-1">Subtotal</div>
          <div className="text-[15px] font-bold text-white">{rabData ? formatRupiah(rabData.summary.subtotal) : 'Rp 0'}</div>
        </div>
        <div className="stat-card py-3 px-4">
          <div className="text-[10px] text-paax-text-muted uppercase tracking-wider mb-1">PPN 11%</div>
          <div className="text-[15px] font-bold text-paax-text-secondary">{rabData ? formatRupiah(rabData.summary.ppn) : 'Rp 0'}</div>
        </div>
        <div className="stat-card py-3 px-4">
          <div className="text-[10px] text-paax-text-muted uppercase tracking-wider mb-1">Contingency</div>
          <div className="text-[15px] font-bold text-paax-text-secondary">{rabData ? formatRupiah(rabData.summary.contingency) : 'Rp 0'}</div>
        </div>
        <div className="stat-card py-3 px-4">
          <div className="text-[10px] text-paax-text-muted uppercase tracking-wider mb-1">Grand Total</div>
          <div className="text-lg font-bold text-indigo-400">{rabData ? formatRupiah(rabData.summary.grand_total) : 'Rp 0'}</div>
        </div>
        <div className="stat-card py-3 px-4">
          <div className="text-[10px] text-paax-text-muted uppercase tracking-wider mb-1">Health Score</div>
          <div className={`text-[15px] font-bold ${healthScore >= 80 ? 'text-emerald-400' : 'text-amber-400'}`}>{healthScore}%</div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => setIsGeneratingModalOpen(true)} className="btn-primary text-[12px]">
          <Sparkles className="w-4 h-4" />
          Generate RAB (AI Core)
        </button>
        <button onClick={handleRecalculate} disabled={!rabData} className="btn-secondary text-[12px]">
          <RefreshCw className="w-4 h-4" />
          Recalculate
        </button>
        <button onClick={handleReview} disabled={!rabData} className="btn-secondary text-[12px]">
          <Eye className="w-4 h-4" />
          Review & Validate
        </button>
        <button onClick={handleOptimize} disabled={!rabData} className="btn-secondary text-[12px]">
          <TrendingDown className="w-4 h-4" />
          Optimize Budget
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-white/[0.06]">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-3 text-[13px] font-medium transition-all ${
              activeTab === tab ? 'tab-active' : 'tab-inactive'
            }`}
          >
            {tab}
            {tab === 'Warnings' && warnings.length > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-amber-500/20 text-amber-400 text-[9px] font-bold">{warnings.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* RAB Table */}
      {activeTab === 'RAB Detail' && (
        <div className="table-container max-h-[600px] overflow-y-auto">
          {rabData ? (
            <table>
              <thead>
                <tr>
                  <th className="w-24">Kode</th>
                  <th className="min-w-[280px]">Uraian Pekerjaan</th>
                  <th className="w-16">Satuan</th>
                  <th className="w-16 text-right">Volume</th>
                  <th className="w-28 text-right">Harga Satuan</th>
                  <th className="w-32 text-right">Jumlah</th>
                </tr>
              </thead>
              <tbody>
                {flattenItems().map((item, i) => (
                  <tr
                    key={i}
                    className={`${
                      item.isHeader
                        ? 'bg-white/[0.03] font-semibold'
                        : ''
                    }`}
                  >
                    <td className="text-[11px] text-paax-text-muted font-mono">{item.kode}</td>
                    <td className={`text-[12px] ${item.isHeader ? 'text-white font-bold text-[13px]' : 'text-paax-text-secondary'}`}>
                      {item.uraian}
                    </td>
                    <td className="text-[11px] text-paax-text-muted">{item.satuan}</td>
                    <td className="text-[12px] text-right text-paax-text-secondary">{item.volume}</td>
                    <td className="text-[12px] text-right text-paax-text-secondary font-mono">{item.harga_satuan ? formatRupiah(item.harga_satuan) : ''}</td>
                    <td className={`text-[12px] text-right font-mono ${item.isHeader ? 'text-white font-bold' : 'text-white'}`}>
                      {item.jumlah ? formatRupiah(item.jumlah) : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="py-20 text-center text-paax-text-muted">
              Belum ada data RAB. Silakan klik "Generate RAB" untuk membuat draft pertama.
            </div>
          )}
        </div>
      )}

      {/* Warnings Tab */}
      {activeTab === 'Warnings' && (
        <div className="space-y-3">
          {warnings.length === 0 ? (
            <div className="py-10 text-center text-paax-text-muted">
              Tidak ada warning atau belum dilakukan review. Klik "Review & Validate".
            </div>
          ) : (
            warnings.map((w, i) => (
              <div key={i} className={`glass-card p-4 border-l-2 ${
                w.severity === 'error' ? 'border-l-red-500' : w.severity === 'warning' ? 'border-l-amber-500' : 'border-l-blue-500'
              }`}>
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {w.severity === 'error' ? <XCircle className="w-4 h-4 text-red-400" /> : w.severity === 'warning' ? <AlertTriangle className="w-4 h-4 text-amber-400" /> : <Info className="w-4 h-4 text-blue-400" />}
                    <h4 className="text-[13px] font-semibold text-white">{w.message}</h4>
                  </div>
                  {getSeverityBadge(w.severity)}
                </div>
                <div className="ml-6 space-y-1">
                  <div className="text-[11px]"><span className="text-paax-text-muted">Affected ID: </span><span className="text-paax-text-secondary">{w.item_id || 'Global'}</span></div>
                  <div className="text-[11px]"><span className="text-paax-text-muted">Code: </span><span className="text-paax-text-secondary">{w.code}</span></div>
                  {w.suggestion && <div className="text-[11px] mt-1"><span className="text-paax-text-muted">Suggestion: </span><span className="text-indigo-400">{w.suggestion}</span></div>}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Assumptions Tab */}
      {activeTab === 'Assumptions' && (
        <div className="glass-card p-6">
          <h3 className="text-sm font-semibold text-white mb-4">Asumsi & Catatan RAB (Core Engine)</h3>
          <div className="space-y-3">
            <p className="text-[12px] text-paax-text-secondary">
              RAB ini dibuat melalui sistem deterministik PAAX Core Engine berdasarkan input parameter proyek.
              Setiap harga satuan ditarik dari database harga standar internal yang telah dimock.
              Perhitungan PPN (11%), Contingency, dan Overhead/Profit mengikuti persentase standar konstruksi yang divalidasi oleh Core Engine.
            </p>
          </div>
        </div>
      )}

      {/* Generate Modal */}
      {isGeneratingModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-900 border border-white/[0.08] rounded-xl w-full max-w-md shadow-2xl overflow-hidden animate-fade-in">
            <div className="flex items-center justify-between p-4 border-b border-white/[0.08]">
              <h2 className="text-lg font-bold text-white">Generate RAB (Core Engine)</h2>
              <button onClick={() => !isGenerating && setIsGeneratingModalOpen(false)} className="text-paax-text-muted hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleGenerateRAB} className="p-4 space-y-4">
              {drawingContext && (
                <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-md mb-4">
                  <h4 className="text-xs font-bold text-amber-400 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" /> V0.5 Limitation
                  </h4>
                  <p className="text-[11px] text-amber-200/80 mt-1">
                    Drawing-aware RAB handoff is prepared in v0.5. The final drawing-based calculation will be implemented in v0.6 Core Engine expansion. For now, it falls back to standard generation.
                  </p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[12px] font-medium text-paax-text-secondary">Luas Bangunan (m²)</label>
                  <input required disabled={isGenerating} value={generateForm.luas_bangunan} onChange={e => setGenerateForm({...generateForm, luas_bangunan: Number(e.target.value)})} type="number" className="input-field" />
                </div>
                <div className="space-y-1">
                  <label className="text-[12px] font-medium text-paax-text-secondary">Jumlah Lantai</label>
                  <input required disabled={isGenerating} value={generateForm.jumlah_lantai} onChange={e => setGenerateForm({...generateForm, jumlah_lantai: Number(e.target.value)})} type="number" className="input-field" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[12px] font-medium text-paax-text-secondary">Tipe Proyek</label>
                  <select disabled={isGenerating} value={generateForm.project_type} onChange={e => setGenerateForm({...generateForm, project_type: e.target.value})} className="input-field appearance-none">
                    <option value="rumah_tinggal">Rumah Tinggal</option>
                    <option value="gedung">Gedung</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[12px] font-medium text-paax-text-secondary">Kelas</label>
                  <select disabled={isGenerating} value={generateForm.kelas_bangunan} onChange={e => setGenerateForm({...generateForm, kelas_bangunan: e.target.value})} className="input-field appearance-none">
                    <option value="sederhana">Sederhana</option>
                    <option value="menengah">Menengah</option>
                    <option value="mewah">Mewah</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-white/[0.08]">
                <button type="button" disabled={isGenerating} onClick={() => setIsGeneratingModalOpen(false)} className="btn-secondary">Batal</button>
                <button type="submit" disabled={isGenerating} className="btn-primary">
                  {isGenerating ? 'Generating...' : 'Generate Deterministic RAB'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
