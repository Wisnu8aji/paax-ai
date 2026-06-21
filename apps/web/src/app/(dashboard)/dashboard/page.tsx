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
} from 'lucide-react';
import Link from 'next/link';

const summaryCards = [
  {
    label: 'Total Proyek',
    value: '12',
    change: '+2 bulan ini',
    trend: 'up',
    icon: Building2,
    color: 'from-indigo-500 to-blue-500',
    bgColor: 'bg-indigo-500/10',
    textColor: 'text-indigo-400',
  },
  {
    label: 'Total Nilai RAB',
    value: 'Rp 28,5M',
    change: '+Rp 4,2M vs bulan lalu',
    trend: 'up',
    icon: Calculator,
    color: 'from-emerald-500 to-teal-500',
    bgColor: 'bg-emerald-500/10',
    textColor: 'text-emerald-400',
  },
  {
    label: 'Project Health',
    value: '78%',
    change: '-3% dari minggu lalu',
    trend: 'down',
    icon: Activity,
    color: 'from-amber-500 to-orange-500',
    bgColor: 'bg-amber-500/10',
    textColor: 'text-amber-400',
  },
  {
    label: 'Warning Aktif',
    value: '23',
    change: '5 critical, 18 medium',
    trend: 'down',
    icon: AlertTriangle,
    color: 'from-red-500 to-pink-500',
    bgColor: 'bg-red-500/10',
    textColor: 'text-red-400',
  },
  {
    label: 'Schedule Risk',
    value: '3 proyek',
    change: 'Terlambat > 5 hari',
    trend: 'down',
    icon: CalendarClock,
    color: 'from-purple-500 to-violet-500',
    bgColor: 'bg-purple-500/10',
    textColor: 'text-purple-400',
  },
  {
    label: 'AI Usage',
    value: '67%',
    change: '670 / 1.000 credits',
    trend: 'up',
    icon: Zap,
    color: 'from-cyan-500 to-blue-500',
    bgColor: 'bg-cyan-500/10',
    textColor: 'text-cyan-400',
  },
];

const quickActions = [
  { label: '+ Buat Proyek', icon: Plus, href: '/proyek', color: 'from-indigo-500 to-blue-500' },
  { label: 'Upload Gambar', icon: Upload, href: '/proyek/proj-001/gambar-kerja', color: 'from-violet-500 to-purple-500' },
  { label: 'Import RAB Excel', icon: FileSpreadsheet, href: '/proyek/proj-001/rab', color: 'from-emerald-500 to-teal-500' },
  { label: 'Generate RAB', icon: Sparkles, href: '/proyek/proj-001/rab', color: 'from-amber-500 to-orange-500' },
  { label: 'Tanya PAAX', icon: MessageSquare, href: '/proyek/proj-001/chat', color: 'from-cyan-500 to-blue-500' },
  { label: 'Export Report', icon: Download, href: '/laporan', color: 'from-pink-500 to-rose-500' },
];

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
  { project: 'Masjid Al-Ikhlas - Bogor', message: 'Jadwal pekerjaan atap bertabrakan dengan pekerjaan plafon', severity: 'warning', time: '1 hari lalu' },
  { project: 'Gudang Logistik - Cikarang', message: 'Material bata ringan belum tersedia di supplier lokal', severity: 'medium', time: '1 hari lalu' },
];

const recentAIActivity = [
  { action: 'RAB Generated', detail: 'Rumah Tinggal Pak Ahmad - 156 item pekerjaan', icon: Calculator, time: '15 menit lalu', status: 'success' },
  { action: 'Gambar Dianalisis', detail: 'Denah Lt.1 - 8 ruangan, 12 pintu, 24 jendela terdeteksi', icon: FileImage, time: '1 jam lalu', status: 'success' },
  { action: 'Schedule Optimization', detail: 'Gedung Kantor BSD - penghematan 12 hari kerja', icon: CalendarClock, time: '2 jam lalu', status: 'success' },
  { action: 'Engineering Chat', detail: 'Konsultasi spesifikasi beton K-300 untuk kolom lantai 3', icon: MessageSquare, time: '3 jam lalu', status: 'info' },
  { action: 'Anomaly Detected', detail: 'Harga cat Dulux berbeda signifikan dari rata-rata AHSP', icon: ShieldAlert, time: '5 jam lalu', status: 'warning' },
];

const activeProjects = [
  {
    id: 'proj-001',
    name: 'Rumah Tinggal Pak Ahmad',
    location: 'Depok, Jawa Barat',
    status: 'active',
    rabValue: 'Rp 850.000.000',
    progress: 65,
    warnings: 3,
    health: 82,
  },
  {
    id: 'proj-002',
    name: 'Gedung Kantor 3 Lantai',
    location: 'BSD, Tangerang Selatan',
    status: 'rab-review',
    rabValue: 'Rp 12.450.000.000',
    progress: 40,
    warnings: 7,
    health: 68,
  },
  {
    id: 'proj-003',
    name: 'Renovasi Ruko Jl. Sudirman',
    location: 'Jakarta Pusat',
    status: 'active',
    rabValue: 'Rp 1.200.000.000',
    progress: 85,
    warnings: 2,
    health: 91,
  },
  {
    id: 'proj-004',
    name: 'Masjid Al-Ikhlas',
    location: 'Bogor, Jawa Barat',
    status: 'scheduling',
    rabValue: 'Rp 3.750.000.000',
    progress: 25,
    warnings: 4,
    health: 75,
  },
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
  return (
    <div className="space-y-6 max-w-[1400px]">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-sm text-paax-text-muted mt-1">
            Selamat sore, <span className="text-paax-text-secondary">Budi</span> · Sabtu, 21 Juni 2026
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-secondary text-[13px]">
            <BarChart3 className="w-4 h-4" />
            Lihat Report
          </button>
          <button className="btn-primary text-[13px]">
            <Plus className="w-4 h-4" />
            Proyek Baru
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
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
              <div className="text-[10px] text-paax-text-muted mt-0.5">{card.change}</div>
            </div>
          );
        })}
      </div>

      {/* Quick Actions */}
      <div className="glass-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Zap className="w-4 h-4 text-amber-400" />
          <h3 className="text-sm font-semibold text-white">Quick Actions</h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
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
        {/* Project Pipeline */}
        <div className="lg:col-span-2 glass-card p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Project Pipeline</h3>
          <div className="flex items-center justify-between gap-1">
            {pipelineStages.map((stage, i) => (
              <div key={stage.label} className="flex items-center gap-1 flex-1">
                <div className="flex flex-col items-center flex-1">
                  <div className={`w-full py-3 rounded-lg ${stage.color}/20 border border-white/[0.04] flex flex-col items-center justify-center`}>
                    <span className="text-lg font-bold text-white">{stage.count}</span>
                    <span className="text-[10px] text-paax-text-muted mt-0.5">{stage.label}</span>
                  </div>
                </div>
                {i < pipelineStages.length - 1 && (
                  <ArrowRight className="w-3.5 h-3.5 text-paax-text-muted flex-shrink-0" />
                )}
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center justify-between text-[11px]">
            <span className="text-paax-text-muted">Total: 12 proyek aktif</span>
            <Link href="/proyek" className="text-indigo-400 hover:text-indigo-300 font-medium flex items-center gap-1">
              Lihat semua <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
        </div>

        {/* Critical Warnings */}
        <div className="lg:col-span-3 glass-card p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <h3 className="text-sm font-semibold text-white">Critical Warnings</h3>
              <span className="badge badge-red text-[10px]">5</span>
            </div>
            <button className="text-[11px] text-indigo-400 hover:text-indigo-300 font-medium">
              Lihat semua
            </button>
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
                    <span className="text-[10px] text-paax-text-muted">·</span>
                    <span className="text-[10px] text-paax-text-muted">{w.time}</span>
                  </div>
                </div>
                <span className={`badge ${getSeverityBadge(w.severity)} text-[9px]`}>
                  {w.severity}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* AI Activity + Active Projects */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Recent AI Activity */}
        <div className="lg:col-span-2 glass-card p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Bot className="w-4 h-4 text-indigo-400" />
              <h3 className="text-sm font-semibold text-white">Recent AI Activity</h3>
            </div>
          </div>
          <div className="space-y-3">
            {recentAIActivity.map((activity, i) => {
              const Icon = activity.icon;
              return (
                <div key={i} className="flex items-start gap-3 group">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    activity.status === 'success' ? 'bg-emerald-500/10' :
                    activity.status === 'warning' ? 'bg-amber-500/10' : 'bg-blue-500/10'
                  }`}>
                    <Icon className={`w-4 h-4 ${
                      activity.status === 'success' ? 'text-emerald-400' :
                      activity.status === 'warning' ? 'text-amber-400' : 'text-blue-400'
                    }`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-medium text-white">{activity.action}</p>
                    <p className="text-[11px] text-paax-text-muted mt-0.5 truncate">{activity.detail}</p>
                  </div>
                  <span className="text-[10px] text-paax-text-muted whitespace-nowrap">{activity.time}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Active Projects */}
        <div className="lg:col-span-3 glass-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-white">Active Projects</h3>
            <Link href="/proyek" className="text-[11px] text-indigo-400 hover:text-indigo-300 font-medium flex items-center gap-1">
              Semua proyek <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
                  <div className="text-[13px] font-semibold text-white mb-2">{project.rabValue}</div>
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
          </div>
        </div>
      </div>
    </div>
  );
}
