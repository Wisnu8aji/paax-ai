'use client';

import React, { useState, useEffect } from 'react';
import { 
  FileSpreadsheet, 
  FileText, 
  Download, 
  Clock, 
  AlertCircle,
  FileBadge
} from 'lucide-react';
import { CoreEngineAPI } from '@/lib/core-engine-client';
import { DRAWING_STORAGE_KEYS, LocalStorage, projectStorageKey, STORAGE_KEYS } from '@/lib/local-storage';
import { DrawingToRabContext } from '@paax/types';

export default function LaporanExportPage() {
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [isExporting, setIsExporting] = useState(false);
  const [drawingContext, setDrawingContext] = useState<DrawingToRabContext | null>(null);
  
  const [history, setHistory] = useState<any[]>([
    { id: 1, name: 'Laporan RAB Lengkap - Rumah Tinggal Pak Ahmad', type: 'excel', status: 'completed', date: '21 Jun 2026, 14:30', size: '1.2 MB' },
    { id: 2, name: 'Executive Summary - Gedung Kantor BSD', type: 'pdf', status: 'completed', date: '20 Jun 2026, 09:15', size: '450 KB' },
  ]);

  useEffect(() => {
    const savedProjects = LocalStorage.get<any[]>(STORAGE_KEYS.PROJECTS, []);
    setProjects(savedProjects);
    if (savedProjects.length > 0) {
      setSelectedProjectId(savedProjects[0].id);
    }
  }, []);

  useEffect(() => {
    const savedContext = LocalStorage.get<DrawingToRabContext | null>(projectStorageKey(DRAWING_STORAGE_KEYS.CONTEXT, selectedProjectId), null);
    if (savedContext?.project_id === selectedProjectId) {
      setDrawingContext(savedContext);
    } else {
      setDrawingContext(null);
    }
  }, [selectedProjectId]);

  const handleExportRABExcel = async () => {
    if (!selectedProjectId) return alert("Pilih proyek terlebih dahulu");
    setIsExporting(true);
    try {
      // We need to fetch RAB data for this project
      const savedRabs = LocalStorage.get<Record<string, any>>(STORAGE_KEYS.RAB_DATA, {});
      const rabData = savedRabs[selectedProjectId];
      
      if (!rabData) {
        alert("Belum ada RAB untuk proyek ini. Silakan generate RAB terlebih dahulu.");
        setIsExporting(false);
        return;
      }

      const result = await CoreEngineAPI.export.excel({
        project_id: selectedProjectId,
        export_type: 'rab',
        data: { groups: rabData.groups, template_name: 'standard_rab' }
      });

      // Add to history
      const selectedProject = projects.find(p => p.id === selectedProjectId);
      const newHistoryItem = {
        id: Date.now(),
        name: `RAB & BOQ Lengkap - ${selectedProject?.name || 'Project'}`,
        type: 'excel',
        status: 'completed',
        date: new Date().toLocaleString(),
        size: '1.5 MB',
        downloadUrl: result.url
      };
      setHistory([newHistoryItem, ...history]);
      
      alert(`Berhasil diexport ke: ${result.url}`);
    } catch (error) {
      console.error(error);
      alert("Gagal export RAB Excel");
    } finally {
      setIsExporting(false);
    }
  };

  const handleMockExport = (name: string, type: string) => {
    if (!selectedProjectId) return alert("Pilih proyek terlebih dahulu");
    setIsExporting(true);
    
    // Simulate delay
    setTimeout(() => {
      const selectedProject = projects.find(p => p.id === selectedProjectId);
      const newHistoryItem = {
        id: Date.now(),
        name: `${name} - ${selectedProject?.name || 'Project'}`,
        type,
        status: 'completed',
        date: new Date().toLocaleString(),
        size: type === 'pdf' ? '850 KB' : '1.2 MB'
      };
      setHistory([newHistoryItem, ...history]);
      setIsExporting(false);
      alert(`Berhasil generate ${name} (${type.toUpperCase()})`);
    }, 1500);
  };

  return (
    <div className="space-y-6 max-w-[1400px]">
      <div>
        <h1 className="text-2xl font-bold text-white">Laporan & Export</h1>
        <p className="text-paax-text-muted text-sm mt-1">Generate laporan proyek standar profesional dalam format Excel dan PDF</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Templates */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">Template Laporan</h2>
            
            <div className="flex items-center gap-2">
              <span className="text-sm text-paax-text-secondary">Pilih Proyek:</span>
              <select 
                value={selectedProjectId} 
                onChange={(e) => setSelectedProjectId(e.target.value)}
                className="input-field py-1.5 text-sm w-48 appearance-none"
              >
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Template Card 1 */}
            <div className="p-5 bg-slate-900 border border-slate-800 rounded-xl hover:border-indigo-500/50 transition-colors group">
              <div className="flex items-start justify-between mb-4">
                <div className="p-3 bg-emerald-500/10 rounded-lg text-emerald-400 group-hover:bg-emerald-500/20 transition-colors">
                  <FileSpreadsheet className="w-6 h-6" />
                </div>
                <span className="text-xs font-medium px-2 py-1 bg-slate-800 text-slate-300 rounded-md">Excel</span>
              </div>
              <h3 className="font-semibold text-white mb-1">RAB & BOQ Lengkap</h3>
              <p className="text-sm text-paax-text-muted mb-4 leading-relaxed">Format standar PUPR dengan sheet Rekapitulasi, Rincian RAB, AHSP, dan Daftar Harga Dasar.</p>
              <button 
                onClick={handleExportRABExcel}
                disabled={isExporting || !selectedProjectId}
                className="btn-primary w-full justify-center"
              >
                {isExporting ? 'Generating...' : 'Generate Excel (Core Engine)'}
              </button>
            </div>

            {/* Template Card 2 */}
            <div className="p-5 bg-slate-900 border border-slate-800 rounded-xl hover:border-indigo-500/50 transition-colors group">
              <div className="flex items-start justify-between mb-4">
                <div className="p-3 bg-red-500/10 rounded-lg text-red-400 group-hover:bg-red-500/20 transition-colors">
                  <FileText className="w-6 h-6" />
                </div>
                <span className="text-xs font-medium px-2 py-1 bg-slate-800 text-slate-300 rounded-md">PDF</span>
              </div>
              <h3 className="font-semibold text-white mb-1">Executive Summary</h3>
              <p className="text-sm text-paax-text-muted mb-4 leading-relaxed">Ringkasan eksekutif berisi profil proyek, nilai total RAB, jadwal makro, dan indikator risiko.</p>
              <button 
                onClick={() => handleMockExport('Executive Summary', 'pdf')}
                disabled={isExporting || !selectedProjectId}
                className="btn-secondary w-full justify-center"
              >
                Generate PDF
              </button>
            </div>

            {/* Template Card 3 */}
            <div className="p-5 bg-slate-900 border border-slate-800 rounded-xl hover:border-indigo-500/50 transition-colors group">
              <div className="flex items-start justify-between mb-4">
                <div className="p-3 bg-emerald-500/10 rounded-lg text-emerald-400 group-hover:bg-emerald-500/20 transition-colors">
                  <FileSpreadsheet className="w-6 h-6" />
                </div>
                <span className="text-xs font-medium px-2 py-1 bg-slate-800 text-slate-300 rounded-md">Excel</span>
              </div>
              <h3 className="font-semibold text-white mb-1">Jadwal & Kurva S</h3>
              <p className="text-sm text-paax-text-muted mb-4 leading-relaxed">Time schedule lengkap dengan Barchart, Kurva S Rencana, dan pembobotan per item pekerjaan.</p>
              <button 
                onClick={() => handleMockExport('Jadwal & Kurva S', 'excel')}
                disabled={isExporting || !selectedProjectId}
                className="btn-secondary w-full justify-center"
              >
                Generate Excel
              </button>
            </div>

            {/* Template Card 4 */}
            <div className="p-5 bg-slate-900 border border-slate-800 rounded-xl hover:border-indigo-500/50 transition-colors group">
              <div className="flex items-start justify-between mb-4">
                <div className="p-3 bg-red-500/10 rounded-lg text-red-400 group-hover:bg-red-500/20 transition-colors">
                  <FileText className="w-6 h-6" />
                </div>
                <span className="text-xs font-medium px-2 py-1 bg-slate-800 text-slate-300 rounded-md">PDF</span>
              </div>
              <h3 className="font-semibold text-white mb-1">Laporan Progress Site</h3>
              <p className="text-sm text-paax-text-muted mb-4 leading-relaxed">Laporan harian/mingguan otomatis lengkap dengan dokumentasi foto dan catatan lapangan.</p>
              <button 
                onClick={() => handleMockExport('Laporan Progress Site', 'pdf')}
                disabled={isExporting || !selectedProjectId}
                className="btn-secondary w-full justify-center"
              >
                Generate PDF
              </button>
            </div>

            {/* Template Card 5: Drawing AI Analysis */}
            <div className="p-5 bg-slate-900 border border-slate-800 rounded-xl hover:border-indigo-500/50 transition-colors group">
              <div className="flex items-start justify-between mb-4">
                <div className="p-3 bg-indigo-500/10 rounded-lg text-indigo-400 group-hover:bg-indigo-500/20 transition-colors">
                  <FileBadge className="w-6 h-6" />
                </div>
                <span className="text-xs font-medium px-2 py-1 bg-slate-800 text-slate-300 rounded-md">PDF</span>
              </div>
              <h3 className="font-semibold text-white mb-1">Drawing AI Analysis Report</h3>
              <p className="text-sm text-paax-text-muted mb-4 leading-relaxed">
                Laporan hasil ekstraksi AI dari gambar kerja, mencakup verifikasi kuantitas BOQ draft, dan rekapitulasi anomali/warnings.
              </p>
              {drawingContext ? (
                <button 
                  onClick={() => handleMockExport('Drawing AI Analysis Report', 'pdf')}
                  disabled={isExporting || !selectedProjectId}
                  className="btn-secondary w-full justify-center text-indigo-400 border-indigo-500/30 hover:bg-indigo-500/10"
                >
                  Generate PDF
                </button>
              ) : (
                <button 
                  disabled
                  className="btn-secondary w-full justify-center opacity-50 cursor-not-allowed"
                >
                  Drawing Data Not Available
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Export History */}
        <div className="lg:col-span-1">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 sticky top-6">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Clock className="w-5 h-5 text-slate-400" />
              Riwayat Export
            </h2>
            <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2">
              {history.map((item) => (
                <div key={item.id} className="p-3 bg-slate-800/50 border border-slate-700/50 rounded-lg">
                  <div className="flex gap-3">
                    <div className="mt-1 flex-shrink-0">
                      {item.type === 'excel' ? (
                        <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
                      ) : (
                        <FileText className="w-5 h-5 text-red-400" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-medium text-slate-200 line-clamp-2 leading-tight mb-1">{item.name}</h4>
                      <div className="flex items-center gap-2 text-xs text-slate-500 mb-2">
                        <span>{item.date}</span>
                        <span>•</span>
                        <span>{item.size}</span>
                      </div>
                      {item.status === 'completed' ? (
                        <button className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 transition-colors">
                          <Download className="w-3 h-3" /> Download
                        </button>
                      ) : (
                        <span className="flex items-center gap-1 text-xs text-red-400">
                          <AlertCircle className="w-3 h-3" /> Gagal Generate
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
