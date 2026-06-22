'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { 
  Calendar, 
  Clock, 
  TrendingDown, 
  TrendingUp, 
  AlertTriangle, 
  CheckCircle2, 
  Settings2,
  Filter,
  Activity,
  Zap,
  X,
  FileText
} from 'lucide-react';
import { CoreEngineAPI, ScheduleVersion, ScheduleTask, ScenarioRequest, DelayRecoveryRequest, DelayRecoveryResponse } from '@/lib/core-engine-client';
import { DRAWING_STORAGE_KEYS, LocalStorage, projectStorageKey, STORAGE_KEYS } from '@/lib/local-storage';
import { formatRupiah, formatDate } from '@/lib/format';
import { DrawingToRabContext } from '@paax/types';

export default function SchedulePage() {
  const params = useParams();
  const projectId = params.projectId as string;
  
  const [project, setProject] = useState<any>(null);
  const [scheduleData, setScheduleData] = useState<ScheduleVersion | null>(null);
  const [scenarios, setScenarios] = useState<ScheduleVersion[]>([]);
  const [activeScenario, setActiveScenario] = useState<string>('normal');
  const [isGenerating, setIsGenerating] = useState(false);
  const [recoveryData, setRecoveryData] = useState<DelayRecoveryResponse | null>(null);
  const [drawingContext, setDrawingContext] = useState<DrawingToRabContext | null>(null);
  
  const [generateForm, setGenerateForm] = useState({
    luas_bangunan: 150,
    jumlah_lantai: 2,
    start_date: new Date().toISOString().split('T')[0],
  });

  const [isGenerateModalOpen, setIsGenerateModalOpen] = useState(false);

  useEffect(() => {
    // Load Project
    const savedProjects = LocalStorage.get<any[]>(STORAGE_KEYS.PROJECTS, []);
    const found = savedProjects.find(p => p.id === projectId);
    if (found) {
      setProject(found);
      if (!generateForm.luas_bangunan && found.luas_bangunan) {
        setGenerateForm(prev => ({...prev, luas_bangunan: found.luas_bangunan, jumlah_lantai: found.jumlah_lantai || 2}));
      }
    }

    // Load Schedule Data
    const savedSchedules = LocalStorage.get<Record<string, ScheduleVersion>>(STORAGE_KEYS.SCHEDULE_DATA, {});
    if (savedSchedules[projectId]) {
      setScheduleData(savedSchedules[projectId]);
      setActiveScenario(savedSchedules[projectId].scenario || 'normal');
    }

    // Load Drawing Context
    const savedContext = LocalStorage.get<DrawingToRabContext | null>(projectStorageKey(DRAWING_STORAGE_KEYS.CONTEXT, projectId), null);
    setDrawingContext(savedContext?.project_id === projectId ? savedContext : null);
  }, [projectId]);

  const saveSchedule = (data: ScheduleVersion) => {
    setScheduleData(data);
    const savedSchedules = LocalStorage.get<Record<string, ScheduleVersion>>(STORAGE_KEYS.SCHEDULE_DATA, {});
    savedSchedules[projectId] = data;
    LocalStorage.set(STORAGE_KEYS.SCHEDULE_DATA, savedSchedules);

    // Update Project Status
    if (project) {
      const updatedProject = { ...project, startDate: formatDate(data.start_date), dueDate: formatDate(data.end_date), status: 'scheduling' };
      const savedProjects = LocalStorage.get<any[]>(STORAGE_KEYS.PROJECTS, []);
      const index = savedProjects.findIndex(p => p.id === projectId);
      if (index !== -1) {
        savedProjects[index] = updatedProject;
        LocalStorage.set(STORAGE_KEYS.PROJECTS, savedProjects);
        setProject(updatedProject);
      }
    }
  };

  const handleGenerate = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsGenerating(true);
    try {
      const req: ScenarioRequest = {
        project_id: projectId,
        scenario: activeScenario as any,
        luas_bangunan: generateForm.luas_bangunan,
        jumlah_lantai: generateForm.jumlah_lantai,
        start_date: generateForm.start_date
      };
      const result = await CoreEngineAPI.schedule.generate(req);
      saveSchedule(result);
      setIsGenerateModalOpen(false);
      setRecoveryData(null);
    } catch (error) {
      console.error(error);
      alert("Gagal generate jadwal. Pastikan Core Engine berjalan.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateScenarios = async () => {
    setIsGenerating(true);
    try {
      const req: ScenarioRequest = {
        project_id: projectId,
        luas_bangunan: generateForm.luas_bangunan,
        jumlah_lantai: generateForm.jumlah_lantai,
        start_date: generateForm.start_date
      };
      const result = await CoreEngineAPI.schedule.scenario(req);
      setScenarios(result);
      // Select the first one automatically
      if (result.length > 0) {
        const normalScenario = result.find(s => s.scenario === 'normal') || result[0];
        setActiveScenario(normalScenario.scenario);
        saveSchedule(normalScenario);
      }
    } catch (error) {
      console.error(error);
      alert("Gagal generate skenario.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDelayRecovery = async () => {
    if (!scheduleData || scheduleData.tasks.length === 0) {
      alert("Generate jadwal terlebih dahulu.");
      return;
    }
    setIsGenerating(true);
    try {
      // Create a dummy delayed task state for demonstration
      const delayedTasks = scheduleData.tasks.map((t, i) => {
        if (i === 1) return { ...t, status: 'delayed' as any, progress_pct: 20 };
        return t;
      });

      const result = await CoreEngineAPI.schedule.delayRecovery({
        project_id: projectId,
        tasks: delayedTasks,
        current_date: new Date().toISOString().split('T')[0], // today
        target_end_date: scheduleData.end_date
      });
      setRecoveryData(result);
      
      // We can preview it by applying the recovered tasks to scheduleData temporarily
      const recoveredSchedule = {
        ...scheduleData,
        scenario: 'recovery',
        tasks: result.recovered_tasks,
        end_date: result.new_end_date
      };
      setScheduleData(recoveredSchedule);
      setActiveScenario('recovery');

    } catch (error) {
      console.error(error);
      alert("Gagal melakukan kalkulasi delay recovery.");
    } finally {
      setIsGenerating(false);
    }
  };

  const applyScenario = (scenarioObj: ScheduleVersion) => {
    setActiveScenario(scenarioObj.scenario);
    saveSchedule(scenarioObj);
    setRecoveryData(null);
  };

  return (
    <div className="space-y-6 max-w-[1400px]">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Schedule & Skenario</h1>
          <p className="text-paax-text-muted text-sm mt-1">Manajemen jadwal proyek dan analisis skenario optimasi</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleDelayRecovery} disabled={!scheduleData} className="btn-secondary text-sm">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            Hitung Recovery Plan
          </button>
          <button onClick={() => setIsGenerateModalOpen(true)} className="btn-primary text-sm">
            <Zap className="w-4 h-4" />
            Generate Skenario AI
          </button>
        </div>
      </div>

      {/* Schedule Readiness Panel */}
      {drawingContext && (
        <div className="bg-indigo-900/20 border border-indigo-500/30 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <FileText className="h-5 w-5 text-indigo-400 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-indigo-100">Schedule Readiness from Verified Drawing</h3>
              <p className="text-xs text-indigo-200/70 mt-1">
                Verified drawing data is available. Currently, scheduling requires RAB completion first.
                Drawing-aware scheduling will be fully implemented in v0.6 Core Engine expansion.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="px-2 py-1 bg-indigo-500/10 text-indigo-300 text-[10px] rounded border border-indigo-500/20">
                  {drawingContext.verified_quantities.length} Verified Quantities
                </span>
                <span className="px-2 py-1 bg-indigo-500/10 text-indigo-300 text-[10px] rounded border border-indigo-500/20">
                  {drawingContext.boq_draft_items.length} BOQ Items
                </span>
                {drawingContext.warnings.length > 0 && (
                  <span className="px-2 py-1 bg-amber-500/10 text-amber-300 text-[10px] rounded border border-amber-500/20">
                    {drawingContext.warnings.length} Warnings
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Skenario Selector */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {scenarios.length > 0 ? scenarios.map((scenario) => (
          <button
            key={scenario.id}
            onClick={() => applyScenario(scenario)}
            className={`p-4 rounded-xl border text-left transition-all ${
              activeScenario === scenario.scenario 
                ? 'bg-indigo-600/10 border-indigo-500 shadow-[0_0_15px_rgba(79,70,229,0.1)]' 
                : 'bg-slate-800/50 border-slate-700/50 hover:bg-slate-800'
            }`}
          >
            <div className="flex justify-between items-center mb-2">
              <h3 className={`font-semibold capitalize ${activeScenario === scenario.scenario ? 'text-indigo-400' : 'text-slate-200'}`}>
                Skenario {scenario.scenario}
              </h3>
              {activeScenario === scenario.scenario && <CheckCircle2 className="w-5 h-5 text-indigo-500" />}
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Durasi:</span>
                <span className="text-slate-200 font-medium">{scenario.total_durasi_hari} Hari</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Target Selesai:</span>
                <span className="text-slate-200 font-medium">{formatDate(scenario.end_date)}</span>
              </div>
            </div>
          </button>
        )) : scheduleData && (
          <button
            className={`p-4 rounded-xl border text-left transition-all bg-indigo-600/10 border-indigo-500 shadow-[0_0_15px_rgba(79,70,229,0.1)]`}
          >
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-semibold text-indigo-400 capitalize">
                {activeScenario === 'recovery' ? 'Recovery Plan' : `Skenario ${activeScenario}`}
              </h3>
              <CheckCircle2 className="w-5 h-5 text-indigo-500" />
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Durasi:</span>
                <span className="text-slate-200 font-medium">{scheduleData.total_durasi_hari} Hari</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Target Selesai:</span>
                <span className="text-slate-200 font-medium">{formatDate(scheduleData.end_date)}</span>
              </div>
            </div>
          </button>
        )}

        {(!scenarios.length && !scheduleData) && (
          <div className="col-span-4 p-8 text-center border border-dashed border-white/[0.1] rounded-xl">
            <Calendar className="w-8 h-8 text-paax-text-muted mx-auto mb-2" />
            <p className="text-paax-text-muted text-sm">Belum ada jadwal. Klik "Generate Skenario AI" untuk memulai.</p>
          </div>
        )}
      </div>

      {/* Recovery Plan Analysis if active */}
      {recoveryData && activeScenario === 'recovery' && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="w-5 h-5 text-amber-400" />
            <h3 className="font-bold text-amber-400">Hasil Analisis Delay Recovery</h3>
          </div>
          <p className="text-sm text-paax-text-secondary mb-4">
            Terdeteksi potensi delay {recoveryData.total_delay_days} hari. Sistem merekomendasikan:
          </p>
          <div className="space-y-2">
            {recoveryData.recovery_actions.map((action, i) => (
              <div key={i} className="flex items-start gap-3 bg-black/20 p-3 rounded-lg">
                <div className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-2 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-white">{action.action} pada {action.task_id}</p>
                  <p className="text-xs text-paax-text-muted mt-0.5">{action.description}</p>
                  <div className="flex gap-4 mt-2">
                    <span className="text-xs text-indigo-400">Durasi baru: {action.new_durasi_hari} hari</span>
                    <span className="text-xs text-red-400">Estimasi biaya naik: +{action.cost_impact_pct}%</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-4 border-t border-amber-500/20 flex justify-between items-center">
            <span className="text-sm text-paax-text-muted">Target akhir baru: {formatDate(recoveryData.new_end_date)}</span>
            <span className={`text-sm font-bold ${recoveryData.feasible ? 'text-emerald-400' : 'text-red-400'}`}>
              {recoveryData.feasible ? 'Plan Feasible' : 'Plan Beresiko Tinggi'}
            </span>
          </div>
        </div>
      )}

      {/* Cost-Time Tradeoff & Metrics */}
      {scheduleData && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="p-4 bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-blue-500/10 rounded-lg text-blue-400">
                <Clock className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-medium text-slate-300">Total Durasi</h3>
            </div>
            <div className="text-2xl font-bold text-white mb-1">{scheduleData.total_durasi_hari} Hari</div>
            <p className="text-xs text-indigo-400 flex items-center gap-1">
              Mulai: {formatDate(scheduleData.start_date)}
            </p>
          </div>

          <div className="p-4 bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-emerald-500/10 rounded-lg text-emerald-400">
                <TrendingUp className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-medium text-slate-300">Progress Proyek</h3>
            </div>
            <div className="text-2xl font-bold text-white mb-1">
              {Math.round(scheduleData.tasks.reduce((sum, t) => sum + (t.progress_pct || 0), 0) / (scheduleData.tasks.length || 1))}%
            </div>
            <p className="text-xs text-slate-400">Rata-rata berbobot</p>
          </div>

          <div className="p-4 bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-amber-500/10 rounded-lg text-amber-400">
                <Activity className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-medium text-slate-300">Status</h3>
            </div>
            <div className="text-2xl font-bold text-white mb-1 capitalize">
              {activeScenario === 'recovery' ? 'Recovering' : 'On Track'}
            </div>
            <p className="text-xs text-slate-400">Berdasarkan baseline skenario {activeScenario}</p>
          </div>
        </div>
      )}

      {/* Task List & Simplified Gantt */}
      {scheduleData && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-slate-800 flex justify-between items-center">
            <h2 className="text-lg font-semibold text-white">Work Breakdown Structure (WBS)</h2>
            <button className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors">
              <Filter className="w-4 h-4" />
            </button>
          </div>
          <div className="overflow-x-auto max-h-[500px]">
            <table className="w-full text-left border-collapse relative">
              <thead className="sticky top-0 z-10 bg-slate-900">
                <tr className="bg-slate-800/50 text-slate-400 text-xs uppercase tracking-wider">
                  <th className="p-4 font-medium w-16">WBS</th>
                  <th className="p-4 font-medium w-64">Nama Pekerjaan</th>
                  <th className="p-4 font-medium w-24">Durasi</th>
                  <th className="p-4 font-medium w-32">Mulai</th>
                  <th className="p-4 font-medium w-32">Selesai</th>
                  <th className="p-4 font-medium w-48">Progress (%)</th>
                  <th className="p-4 font-medium w-32">Status</th>
                </tr>
              </thead>
              <tbody className="text-sm divide-y divide-slate-800/50">
                {scheduleData.tasks.map((task, idx) => (
                  <tr key={idx} className="hover:bg-slate-800/30 transition-colors">
                    <td className="p-4 text-slate-300 font-mono">{task.wbs}</td>
                    <td className="p-4 font-medium text-slate-200">{task.nama}</td>
                    <td className="p-4 text-slate-400">{task.durasi_hari} hr</td>
                    <td className="p-4 text-slate-400">{formatDate(task.start_date)}</td>
                    <td className="p-4 text-slate-400">{formatDate(task.end_date)}</td>
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                          <div 
                            className={`h-full rounded-full ${
                              task.status === 'completed' ? 'bg-emerald-500' :
                              task.status === 'delayed' ? 'bg-red-500' :
                              task.status === 'in_progress' ? 'bg-indigo-500' :
                              'bg-slate-600'
                            }`}
                            style={{ width: `${task.progress_pct || 0}%` }}
                          ></div>
                        </div>
                        <span className="text-xs text-slate-400 w-8">{task.progress_pct || 0}%</span>
                      </div>
                    </td>
                    <td className="p-4">
                      {task.status === 'completed' && <span className="badge badge-green text-[10px]">Selesai</span>}
                      {task.status === 'delayed' && <span className="badge badge-red text-[10px]">Terlambat</span>}
                      {task.status === 'in_progress' && <span className="badge badge-blue text-[10px]">Berjalan</span>}
                      {task.status === 'not_started' && <span className="badge badge-slate text-[10px]">Pending</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Generate Modal */}
      {isGenerateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-900 border border-white/[0.08] rounded-xl w-full max-w-md shadow-2xl overflow-hidden animate-fade-in">
            <div className="flex items-center justify-between p-4 border-b border-white/[0.08]">
              <h2 className="text-lg font-bold text-white">Generate Jadwal & Skenario</h2>
              <button onClick={() => !isGenerating && setIsGenerateModalOpen(false)} className="text-paax-text-muted hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-4 space-y-4">
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

              <div className="space-y-1">
                <label className="text-[12px] font-medium text-paax-text-secondary">Tanggal Mulai Proyek</label>
                <input required disabled={isGenerating} value={generateForm.start_date} onChange={e => setGenerateForm({...generateForm, start_date: e.target.value})} type="date" className="input-field" />
              </div>

              <div className="flex flex-col gap-2 pt-2 border-t border-white/[0.08]">
                <button onClick={() => handleGenerate()} disabled={isGenerating} className="btn-primary w-full justify-center">
                  {isGenerating ? 'Generating...' : 'Generate Jadwal Normal (1 Skenario)'}
                </button>
                <button onClick={() => handleGenerateScenarios()} disabled={isGenerating} className="btn-secondary w-full justify-center">
                  <Zap className="w-4 h-4" />
                  Generate Multi Skenario AI (Hemat, Normal, Cepat)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
