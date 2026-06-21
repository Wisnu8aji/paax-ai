import React from 'react';
import { 
  Calendar, 
  Clock, 
  TrendingDown, 
  TrendingUp, 
  AlertTriangle, 
  CheckCircle2, 
  Settings2,
  ChevronRight,
  Filter
} from 'lucide-react';

export default function SchedulePage() {
  const scenarios = [
    { id: 'hemat', name: 'Skenario Hemat', duration: '120 Hari', cost: 'Rp 1.85M', active: false },
    { id: 'normal', name: 'Skenario Normal', duration: '90 Hari', cost: 'Rp 2.15M', active: true },
    { id: 'cepat', name: 'Skenario Cepat', duration: '75 Hari', cost: 'Rp 2.45M', active: false },
    { id: 'recovery', name: 'Recovery Plan', duration: '82 Hari', cost: 'Rp 2.30M', active: false },
  ];

  const tasks = [
    { wbs: '1.0', name: 'Pekerjaan Persiapan', duration: 7, start: '1 Mar 2026', end: '7 Mar 2026', progress: 100, status: 'completed', crew: 5 },
    { wbs: '2.0', name: 'Pekerjaan Tanah & Pondasi', duration: 14, start: '8 Mar 2026', end: '21 Mar 2026', progress: 85, status: 'in-progress', crew: 12 },
    { wbs: '3.0', name: 'Pekerjaan Struktur Lantai 1', duration: 21, start: '22 Mar 2026', end: '11 Apr 2026', progress: 0, status: 'pending', crew: 15 },
    { wbs: '4.0', name: 'Pekerjaan Struktur Lantai 2', duration: 21, start: '12 Apr 2026', end: '2 Mei 2026', progress: 0, status: 'pending', crew: 15 },
    { wbs: '5.0', name: 'Pekerjaan Arsitektur', duration: 30, start: '3 Mei 2026', end: '1 Jun 2026', progress: 0, status: 'pending', crew: 20 },
    { wbs: '6.0', name: 'Pekerjaan MEP', duration: 25, start: '15 Mei 2026', end: '8 Jun 2026', progress: 0, status: 'pending', crew: 8 },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Schedule & Skenario</h1>
          <p className="text-slate-400 text-sm mt-1">Manajemen jadwal proyek dan analisis skenario optimasi</p>
        </div>
        <div className="flex gap-2">
          <button className="flex items-center gap-2 px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm font-medium text-white hover:bg-slate-700 transition-colors">
            <Settings2 className="w-4 h-4" />
            Parameter AI
          </button>
          <button className="flex items-center gap-2 px-4 py-2 bg-indigo-600 rounded-lg text-sm font-medium text-white hover:bg-indigo-700 transition-colors">
            Generate Skenario
          </button>
        </div>
      </div>

      {/* Skenario Selector */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {scenarios.map((scenario) => (
          <button
            key={scenario.id}
            className={`p-4 rounded-xl border text-left transition-all ${
              scenario.active 
                ? 'bg-indigo-600/10 border-indigo-500 shadow-[0_0_15px_rgba(79,70,229,0.1)]' 
                : 'bg-slate-800/50 border-slate-700/50 hover:bg-slate-800'
            }`}
          >
            <div className="flex justify-between items-center mb-2">
              <h3 className={`font-semibold ${scenario.active ? 'text-indigo-400' : 'text-slate-200'}`}>
                {scenario.name}
              </h3>
              {scenario.active && <CheckCircle2 className="w-5 h-5 text-indigo-500" />}
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Durasi:</span>
                <span className="text-slate-200 font-medium">{scenario.duration}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Estimasi Biaya:</span>
                <span className="text-slate-200 font-medium">{scenario.cost}</span>
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Cost-Time Tradeoff & Metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="p-4 bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-blue-500/10 rounded-lg text-blue-400">
              <Clock className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-medium text-slate-300">Durasi Kritis</h3>
          </div>
          <div className="text-2xl font-bold text-white mb-1">90 Hari</div>
          <p className="text-xs text-green-400 flex items-center gap-1">
            <TrendingDown className="w-3 h-3" /> 5 hari lebih cepat dari baseline
          </p>
        </div>

        <div className="p-4 bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-emerald-500/10 rounded-lg text-emerald-400">
              <TrendingUp className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-medium text-slate-300">Efisiensi Biaya</h3>
          </div>
          <div className="text-2xl font-bold text-white mb-1">Rp 125.5 Jt</div>
          <p className="text-xs text-slate-400">Potensi penghematan overhead</p>
        </div>

        <div className="p-4 bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-amber-500/10 rounded-lg text-amber-400">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-medium text-slate-300">Schedule Risk</h3>
          </div>
          <div className="text-2xl font-bold text-white mb-1">Medium</div>
          <p className="text-xs text-slate-400">Cuaca dapat mempengaruhi minggu ke-4</p>
        </div>
      </div>

      {/* Task List & Simplified Gantt */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex justify-between items-center">
          <h2 className="text-lg font-semibold text-white">Work Breakdown Structure (WBS)</h2>
          <button className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors">
            <Filter className="w-4 h-4" />
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-800/50 text-slate-400 text-xs uppercase tracking-wider">
                <th className="p-4 font-medium w-16">WBS</th>
                <th className="p-4 font-medium w-64">Nama Pekerjaan</th>
                <th className="p-4 font-medium w-24">Durasi</th>
                <th className="p-4 font-medium w-32">Mulai</th>
                <th className="p-4 font-medium w-32">Selesai</th>
                <th className="p-4 font-medium w-48">Progress (%)</th>
                <th className="p-4 font-medium w-24">Manpower</th>
              </tr>
            </thead>
            <tbody className="text-sm divide-y divide-slate-800/50">
              {tasks.map((task, idx) => (
                <tr key={idx} className="hover:bg-slate-800/30 transition-colors">
                  <td className="p-4 text-slate-300">{task.wbs}</td>
                  <td className="p-4 font-medium text-slate-200">{task.name}</td>
                  <td className="p-4 text-slate-400">{task.duration} hr</td>
                  <td className="p-4 text-slate-400">{task.start}</td>
                  <td className="p-4 text-slate-400">{task.end}</td>
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                        <div 
                          className={`h-full rounded-full ${
                            task.status === 'completed' ? 'bg-emerald-500' :
                            task.status === 'in-progress' ? 'bg-indigo-500' :
                            'bg-slate-600'
                          }`}
                          style={{ width: `${task.progress}%` }}
                        ></div>
                      </div>
                      <span className="text-xs text-slate-400 w-8">{task.progress}%</span>
                    </div>
                  </td>
                  <td className="p-4 text-slate-400">
                    <div className="flex items-center gap-1">
                      <Settings2 className="w-3 h-3" />
                      {task.crew} org
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
