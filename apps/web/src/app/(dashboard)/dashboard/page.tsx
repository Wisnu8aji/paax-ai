'use client';

import { useState, useEffect } from 'react';
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Activity,
  Zap,
  Plus,
  Upload,
  FileSpreadsheet,
  Sparkles,
  MessageSquare,
  Download,
  ArrowRight,
  Clock,
  CheckCircle2,
  XCircle,
  FileImage,
  Calculator,
  CalendarClock,
  Bot,
  ChevronRight,
  Building2,
  MapPin,
  BarChart3,
  ShieldAlert,
  Server,
  RefreshCw
} from 'lucide-react';
import Link from 'next/link';
import { CoreEngineAPI } from '@/lib/core-engine-client';
import { LocalStorage, STORAGE_KEYS } from '@/lib/local-storage';
import { formatRupiah, formatDate } from '@/lib/format';

const pipelineStages = [
  { label: 'Draft', count: 3, color: 'bg-slate-500' },
  { label: 'Drawing', count: 2, color: 'bg-violet-500' },
  { label: 'RAB', count: 4, color: 'bg-blue-500' },
  { label: 'Schedule', count: 2, color: 'bg-amber-500' },
  { label: 'Active', count: 1, color: 'bg-emerald-500' },
];

const criticalWarnings = [
  { project: 'Gedung Kantor 3 Lantai - BSD', message: 'Harga besi beton naik 15% dari estimasi AHSP', severity: 'critical', time: '2 jam lalu' },
  { project: 'Rumah Tinggal Pak Ahmad - Depok', message: 'Volume pondasi tidak konsisten dengan gambar denah', severity: 'critical', time: '4 jam lalu' },
  { project: 'Renovasi Ruko Jl. Sudirman', message: 'RAB melebihi budget klien sebesar 8.2%', severity: 'warning', time: '6 jam lalu' },
];

const recentAIActivity = [
  { action: 'RAB Generated', detail: 'Rumah Tinggal Pak Ahmad - 156 item pekerjaan', icon: Calculator, time: '15 menit lalu', status: 'success' },
  { action: 'Gambar Dianalisis', detail: 'Denah Lt.1 - 8 ruangan, 12 pintu, 24 jendela terdeteksi', icon: FileImage, time: '1 jam lalu', status: 'success' },
  { action: 'Schedule Optimization', detail: 'Gedung Kantor BSD - penghematan 12 hari kerja', icon: CalendarClock, time: '2 jam lalu', status: 'success' },
];

function getStatusBadge(status: string) {
  const map: Record<string, { label: string; className: string }> = {
    'active': { label: 'Aktif', className: 'badge-green' },
    'rab-review': { label: 'RAB Review', className: 'badge-amber' },
    'scheduling': { label: 'Scheduling', className: 'badge-blue' },
    'draft': { label: 'Draft', className: 'badge-slate' },
  };
  return map[status] || { label: status, className: 'badge-slate' };
}

function getSeverityBadge(severity: string) {
  const map: Record<string, string> = {
    'critical': 'badge-red',
    'warning': 'badge-amber',
    'medium': 'badge-blue',
  };
  return map[severity] || 'badge-slate';
}

export default function DashboardPage() {
  const [coreEngineStatus, setCoreEngineStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [coreEngineVersion, setCoreEngineVersion] = useState<string>('-');
  const [activeProjects, setActiveProjects] = useState<any[]>([]);
  const [totalRab, setTotalRab] = useState(0);

  const checkHealth = async () => {
    setCoreEngineStatus('checking');
    try {
      const res = await CoreEngineAPI.health();
      setCoreEngineStatus('online');
      setCoreEngineVersion(res.version);
    } catch (e) {
      setCoreEngineStatus('offline');
      setCoreEngineVersion('-');
    }
  };

  useEffect(() => {
    checkHealth();

    // Load projects from localStorage
    const savedProjects = LocalStorage.get<any[]>(STORAGE_KEYS.PROJECTS, []);
    
    // Seed dummy projects if empty
    if (savedProjects.length === 0) {
      const dummyProjects = [
        {
          id: 'proj-001',
          name: 'Rumah Tinggal Pak Ahmad',
          location: 'Depok, Jawa Barat',
          status: 'active',
          rabValue: 850000000,
          progress: 65,
          warnings: 3,
          health: 82,
          created_at: new Date().toISOString()
        },
        {
          id: 'proj-002',
          name: 'Gedung Kantor 3 Lantai',
          location: 'BSD, Tangerang Selatan',
          status: 'rab-review',
          rabValue: 12450000000,
          progress: 40,
          warnings: 7,
          health: 68,
          created_at: new Date().toISOString()
        }
      ];
      LocalStorage.set(STORAGE_KEYS.PROJECTS, dummyProjects);
      setActiveProjects(dummyProjects);
      setTotalRab(dummyProjects.reduce((sum, p) => sum + (p.rabValue || 0), 0));
    } else {
      setActiveProjects(savedProjects);
      setTotalRab(savedProjects.reduce((sum, p) => sum + (p.rabValue || 0), 0));
    }
  }, []);

  const summaryCards = [
    {
      label: 'Total Proyek',
      value: activeProjects.length.toString(),
      change: 'Aktif saat ini',
      trend: 'up',
      icon: Building2,
      color: 'from-indigo-500 to-blue-500',
      bgColor: 'bg-indigo-500/10',
      textColor: 'text-indigo-400',
    },
    {
      label: 'Total Nilai RAB',
      value: formatRupiah(totalRab),
      change: 'Estimasi nilai proyek',
      trend: 'up',
      icon: Calculator,
      color: 'from-emerald-500 to-teal-500',
      bgColor: 'bg-emerald-500/10',
      textColor: 'text-emerald-400',
    },
    {
      label: 'Project Health',
      value: '78%',
      change: 'Rata-rata',
      trend: 'down',
      icon: Activity,
      color: 'from-amber-500 to-orange-500',
      bgColor: 'bg-amber-500/10',
      textColor: 'text-amber-400',
    },
    {
      label: 'Core Engine Status',
      value: coreEngineStatus === 'online' ? 'Online' : coreEngineStatus === 'offline' ? 'Offline' : 'Checking...',
      change: coreEngineStatus === 'online' ? `v${coreEngineVersion}` : 'Jalankan uvicorn app.main:app',
      trend: coreEngineStatus === 'online' ? 'up' : 'down',
      icon: Server,
      color: coreEngineStatus === 'online' ? 'from-emerald-500 to-teal-500' : 'from-red-500 to-rose-500',
      bgColor: coreEngineStatus === 'online' ? 'bg-emerald-500/10' : 'bg-red-500/10',
      textColor: coreEngineStatus === 'online' ? 'text-emerald-400' : 'text-red-400',
    }
  ];

  const quickActions = [
    { label: '+ Buat Proyek', icon: Plus, href: '/proyek', color: 'from-indigo-500 to-blue-500' },
    { label: 'Generate RAB', icon: Sparkles, href: activeProjects.length > 0 ? `/proyek/${activeProjects[0].id}/rab` : '/proyek', color: 'from-amber-500 to-orange-500' },
    { label: 'Jadwal & Skenario', icon: CalendarClock, href: activeProjects.length > 0 ? `/proyek/${activeProjects[0].id}/schedule` : '/proyek', color: 'from-emerald-500 to-teal-500' },
    { label: 'Export Report', icon: Download, href: '/laporan', color: 'from-pink-500 to-rose-500' },
  ];

  return (
    <div className="space-y-6 max-w-[1400px]">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard Interactive</h1>
          <p className="text-sm text-paax-text-muted mt-1">
            Selamat datang di PAAX v0.5 Workspace
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={checkHealth} className="btn-secondary text-[13px]" disabled={coreEngineStatus === 'checking'}>
            <RefreshCw className={`w-4 h-4 ${coreEngineStatus === 'checking' ? 'animate-spin' : ''}`} />
            Cek Core Engine
          </button>
          <Link href="/proyek" className="btn-primary text-[13px]">
            <Plus className="w-4 h-4" />
            Proyek Baru
          </Link>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {summaryCards.map((card, i) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className={`stat-card animate-fade-in animate-fade-in-delay-${i + 1}`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className={`w-9 h-9 rounded-lg ${card.bgColor} flex items-center justify-center`}>
                  <Icon className={`w-[18px] h-[18px] ${card.textColor}`} />
                </div>
                {card.trend === 'up' ? (
                  <TrendingUp className="w-4 h-4 text-emerald-400" />
                ) : (
                  <TrendingDown className="w-4 h-4 text-red-400" />
                )}
              </div>
              <div className="text-xl font-bold text-white">{card.value}</div>
              <div className="text-[11px] text-paax-text-muted mt-1">{card.label}</div>
              <div className={`text-[10px] mt-0.5 ${card.label === 'Core Engine Status' && coreEngineStatus === 'offline' ? 'text-red-400' : 'text-paax-text-muted'}`}>
                {card.change}
              </div>
            </div>
          );
        })}
      </div>

      {/* Core Engine Error Banner */}
      {coreEngineStatus === 'offline' && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex items-start gap-3">
          <Server className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold text-red-400">Core Engine Offline</h3>
            <p className="text-xs text-red-300/80 mt-1">
              Backend deterministik belum berjalan. Beberapa fitur perhitungan RAB dan Jadwal tidak akan berfungsi.
            </p>
            <code className="text-[11px] bg-black/30 text-red-200 px-2 py-1 rounded mt-2 block w-max">
              cd services/core-engine && uvicorn app.main:app --reload --port 8081
            </code>
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="glass-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Zap className="w-4 h-4 text-amber-400" />
          <h3 className="text-sm font-semibold text-white">Quick Actions</h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {quickActions.map((action) => {
            const Icon = action.icon;
            return (
              <Link
                key={action.label}
                href={action.href}
                className="flex flex-col items-center gap-2 p-3 rounded-lg bg-white/[0.02] border border-white/[0.04] hover:bg-white/[0.05] hover:border-white/[0.08] transition-all group"
              >
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${action.color} flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform`}>
                  <Icon className="w-5 h-5 text-white" />
                </div>
                <span className="text-[11px] font-medium text-paax-text-secondary text-center leading-tight">
                  {action.label}
                </span>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Pipeline + Warnings Row */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Active Projects */}
        <div className="lg:col-span-3 glass-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-white">Proyek Aktif (Local Storage)</h3>
            <Link href="/proyek" className="text-[11px] text-indigo-400 hover:text-indigo-300 font-medium flex items-center gap-1">
              Semua proyek <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="grid grid-cols-1 gap-3">
            {activeProjects.map((project) => {
              const statusBadge = getStatusBadge(project.status);
              return (
                <Link
                  key={project.id}
                  href={`/proyek/${project.id}`}
                  className="p-3.5 rounded-lg bg-white/[0.02] border border-white/[0.04] hover:bg-white/[0.04] hover:border-white/[0.08] transition-all group"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="min-w-0 flex-1">
                      <h4 className="text-[13px] font-semibold text-white truncate group-hover:text-indigo-300 transition-colors">
                        {project.name}
                      </h4>
                      <div className="flex items-center gap-1 mt-0.5">
                        <MapPin className="w-3 h-3 text-paax-text-muted" />
                        <span className="text-[10px] text-paax-text-muted">{project.location}</span>
                      </div>
                    </div>
                    <span className={`badge ${statusBadge.className} text-[9px] ml-2`}>{statusBadge.label}</span>
                  </div>
                  <div className="text-[13px] font-semibold text-white mb-2">{formatRupiah(project.rabValue)}</div>
                  <div className="flex items-center gap-3 text-[10px]">
                    <div className="flex-1">
                      <div className="flex justify-between mb-1">
                        <span className="text-paax-text-muted">Progress</span>
                        <span className="text-paax-text-secondary font-medium">{project.progress}%</span>
                      </div>
                      <div className="progress-bar">
                        <div
                          className="progress-bar-fill bg-gradient-to-r from-indigo-500 to-blue-500"
                          style={{ width: `${project.progress}%` }}
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-1 text-amber-400">
                      <AlertTriangle className="w-3 h-3" />
                      <span className="font-medium">{project.warnings}</span>
                    </div>
                    <div className={`flex items-center gap-1 ${project.health >= 80 ? 'text-emerald-400' : project.health >= 70 ? 'text-amber-400' : 'text-red-400'}`}>
                      <Activity className="w-3 h-3" />
                      <span className="font-medium">{project.health}%</span>
                    </div>
                  </div>
                </Link>
              );
            })}
            
            {activeProjects.length === 0 && (
              <div className="text-center py-8">
                <p className="text-sm text-paax-text-muted">Belum ada proyek.</p>
              </div>
            )}
          </div>
        </div>

        {/* Critical Warnings */}
        <div className="lg:col-span-2 glass-card p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <h3 className="text-sm font-semibold text-white">Critical Warnings</h3>
            </div>
          </div>
          <div className="space-y-2">
            {criticalWarnings.map((w, i) => (
              <div key={i} className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-white/[0.02] transition-all">
                <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${
                  w.severity === 'critical' ? 'bg-red-400' : w.severity === 'warning' ? 'bg-amber-400' : 'bg-blue-400'
                }`} />
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] text-paax-text-secondary leading-relaxed">{w.message}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] text-paax-text-muted">{w.project}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
