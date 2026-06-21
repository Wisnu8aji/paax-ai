import {
  Building2,
  MapPin,
  User,
  Calendar,
  Calculator,
  AlertTriangle,
  Activity,
  Clock,
  CheckCircle2,
  TrendingUp,
  Layers,
  Ruler,
  FileImage,
  MessageSquare,
} from 'lucide-react';

const projectMilestones = [
  { name: 'Pekerjaan Persiapan', status: 'completed', progress: 100, date: '15 Mar 2026' },
  { name: 'Pekerjaan Pondasi', status: 'completed', progress: 100, date: '10 Apr 2026' },
  { name: 'Pekerjaan Struktur Lt.1', status: 'active', progress: 75, date: '20 May 2026' },
  { name: 'Pekerjaan Struktur Lt.2', status: 'upcoming', progress: 10, date: '15 Jun 2026' },
  { name: 'Pekerjaan Atap', status: 'upcoming', progress: 0, date: '01 Jul 2026' },
  { name: 'Pekerjaan Dinding & Plester', status: 'upcoming', progress: 0, date: '20 Jul 2026' },
  { name: 'Pekerjaan MEP', status: 'upcoming', progress: 0, date: '10 Aug 2026' },
  { name: 'Pekerjaan Finishing', status: 'upcoming', progress: 0, date: '25 Aug 2026' },
];

const recentActivities = [
  { action: 'RAB diperbarui', detail: 'Revisi harga material besi beton', time: '15 menit lalu', user: 'Budi A.' },
  { action: 'Gambar kerja diupload', detail: 'Denah Lt.2 revisi 3', time: '2 jam lalu', user: 'Andi S.' },
  { action: 'Chat AI', detail: 'Konsultasi spesifikasi beton kolom', time: '3 jam lalu', user: 'Budi A.' },
  { action: 'Schedule diupdate', detail: 'Pekerjaan struktur Lt.1 selesai 75%', time: '1 hari lalu', user: 'Rudi P.' },
  { action: 'Warning resolved', detail: 'Koreksi volume galian pondasi', time: '2 hari lalu', user: 'Budi A.' },
];

export default function ProjectOverviewPage() {
  return (
    <div className="space-y-6">
      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-2">
            <Calculator className="w-4 h-4 text-indigo-400" />
            <span className="text-[11px] text-paax-text-muted uppercase tracking-wider">Nilai RAB</span>
          </div>
          <div className="text-xl font-bold text-white">Rp 850.000.000</div>
          <div className="text-[10px] text-emerald-400 mt-1">Approved · Rp 23.611/m²</div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-2">
            <Activity className="w-4 h-4 text-emerald-400" />
            <span className="text-[11px] text-paax-text-muted uppercase tracking-wider">Progress</span>
          </div>
          <div className="text-xl font-bold text-white">65%</div>
          <div className="progress-bar mt-2">
            <div className="progress-bar-fill bg-gradient-to-r from-indigo-500 to-blue-500" style={{ width: '65%' }} />
          </div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            <span className="text-[11px] text-paax-text-muted uppercase tracking-wider">Warnings</span>
          </div>
          <div className="text-xl font-bold text-white">3</div>
          <div className="text-[10px] text-amber-400 mt-1">1 critical · 2 medium</div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-4 h-4 text-blue-400" />
            <span className="text-[11px] text-paax-text-muted uppercase tracking-wider">Deadline</span>
          </div>
          <div className="text-xl font-bold text-white">86 hari</div>
          <div className="text-[10px] text-paax-text-muted mt-1">15 Sep 2026 · On Track</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Project Info */}
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Informasi Proyek</h3>
          <div className="space-y-3">
            {[
              { icon: Building2, label: 'Tipe', value: 'Rumah Tinggal 2 Lantai' },
              { icon: MapPin, label: 'Lokasi', value: 'Jl. Margonda Raya No. 45, Depok' },
              { icon: User, label: 'Klien', value: 'Pak Ahmad Suryadi' },
              { icon: Layers, label: 'Jumlah Lantai', value: '2 Lantai + Rooftop' },
              { icon: Ruler, label: 'Luas Bangunan', value: '180 m²' },
              { icon: Ruler, label: 'Luas Tanah', value: '250 m²' },
              { icon: Calendar, label: 'Mulai', value: '15 Maret 2026' },
              { icon: Calendar, label: 'Target Selesai', value: '15 September 2026' },
            ].map((item, i) => {
              const Icon = item.icon;
              return (
                <div key={i} className="flex items-center justify-between py-1.5">
                  <div className="flex items-center gap-2">
                    <Icon className="w-3.5 h-3.5 text-paax-text-muted" />
                    <span className="text-[12px] text-paax-text-muted">{item.label}</span>
                  </div>
                  <span className="text-[12px] text-paax-text-secondary font-medium">{item.value}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Milestones */}
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Milestone & Progress</h3>
          <div className="space-y-2">
            {projectMilestones.map((m, i) => (
              <div key={i} className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/[0.02] transition-all">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                  m.status === 'completed' ? 'bg-emerald-500/20' :
                  m.status === 'active' ? 'bg-blue-500/20' : 'bg-white/[0.05]'
                }`}>
                  {m.status === 'completed' ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  ) : m.status === 'active' ? (
                    <Activity className="w-3.5 h-3.5 text-blue-400" />
                  ) : (
                    <Clock className="w-3.5 h-3.5 text-paax-text-muted" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className={`text-[12px] font-medium ${
                      m.status === 'completed' ? 'text-paax-text-muted line-through' :
                      m.status === 'active' ? 'text-white' : 'text-paax-text-secondary'
                    }`}>{m.name}</span>
                    <span className="text-[10px] text-paax-text-muted">{m.progress}%</span>
                  </div>
                  {m.status === 'active' && (
                    <div className="progress-bar mt-1">
                      <div className="progress-bar-fill bg-blue-500" style={{ width: `${m.progress}%` }} />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Aktivitas Terakhir</h3>
          <div className="space-y-3">
            {recentActivities.map((a, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 mt-1.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-medium text-white">{a.action}</p>
                  <p className="text-[11px] text-paax-text-muted">{a.detail}</p>
                  <div className="flex items-center gap-2 mt-0.5 text-[10px] text-paax-text-muted">
                    <span>{a.user}</span>
                    <span>·</span>
                    <span>{a.time}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Warnings Section */}
      <div className="glass-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <AlertTriangle className="w-4 h-4 text-amber-400" />
          <h3 className="text-sm font-semibold text-white">Active Warnings</h3>
        </div>
        <div className="space-y-2">
          {[
            { message: 'Harga besi beton D16 naik 15% dari estimasi AHSP Kab. Depok 2026', severity: 'critical', source: 'RAB Check' },
            { message: 'Volume pondasi cakar ayam tidak konsisten dengan gambar denah revisi 3', severity: 'warning', source: 'Drawing Analysis' },
            { message: 'Jadwal pekerjaan plesteran overlap dengan jadwal instalasi MEP', severity: 'warning', source: 'Schedule Check' },
          ].map((w, i) => (
            <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-white/[0.02] border border-white/[0.04]">
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                w.severity === 'critical' ? 'bg-red-400' : 'bg-amber-400'
              }`} />
              <div className="flex-1">
                <p className="text-[12px] text-paax-text-secondary">{w.message}</p>
                <span className="text-[10px] text-paax-text-muted">{w.source}</span>
              </div>
              <span className={`badge ${w.severity === 'critical' ? 'badge-red' : 'badge-amber'} text-[9px]`}>
                {w.severity}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
