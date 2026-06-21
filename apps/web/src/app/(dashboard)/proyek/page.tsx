import Link from 'next/link';
import {
  Plus,
  Search,
  Filter,
  MapPin,
  AlertTriangle,
  Activity,
  Calendar,
  Building2,
  ChevronRight,
  LayoutGrid,
  List,
} from 'lucide-react';

const projects = [
  {
    id: 'proj-001',
    name: 'Rumah Tinggal Pak Ahmad',
    location: 'Depok, Jawa Barat',
    client: 'Pak Ahmad Suryadi',
    status: 'active',
    type: 'Residensial',
    rabValue: 'Rp 850.000.000',
    progress: 65,
    warnings: 3,
    health: 82,
    startDate: '15 Mar 2026',
    dueDate: '15 Sep 2026',
    lastActivity: '15 menit lalu',
    description: 'Pembangunan rumah tinggal 2 lantai, luas bangunan 180m²',
  },
  {
    id: 'proj-002',
    name: 'Gedung Kantor 3 Lantai',
    location: 'BSD, Tangerang Selatan',
    client: 'PT Maju Bersama',
    status: 'rab-review',
    type: 'Komersial',
    rabValue: 'Rp 12.450.000.000',
    progress: 40,
    warnings: 7,
    health: 68,
    startDate: '01 Apr 2026',
    dueDate: '01 Dec 2026',
    lastActivity: '2 jam lalu',
    description: 'Gedung perkantoran 3 lantai + basement, luas total 2.400m²',
  },
  {
    id: 'proj-003',
    name: 'Renovasi Ruko Jl. Sudirman',
    location: 'Jakarta Pusat',
    client: 'Ibu Siti Rahayu',
    status: 'active',
    type: 'Komersial',
    rabValue: 'Rp 1.200.000.000',
    progress: 85,
    warnings: 2,
    health: 91,
    startDate: '10 Jan 2026',
    dueDate: '10 Jul 2026',
    lastActivity: '6 jam lalu',
    description: 'Renovasi total ruko 3 lantai, facade baru, interior modern',
  },
  {
    id: 'proj-004',
    name: 'Masjid Al-Ikhlas',
    location: 'Bogor, Jawa Barat',
    client: 'Yayasan Al-Ikhlas',
    status: 'scheduling',
    type: 'Ibadah',
    rabValue: 'Rp 3.750.000.000',
    progress: 25,
    warnings: 4,
    health: 75,
    startDate: '01 May 2026',
    dueDate: '01 May 2027',
    lastActivity: '1 hari lalu',
    description: 'Pembangunan masjid 2 lantai, kapasitas 500 jamaah, kubah utama 12m',
  },
  {
    id: 'proj-005',
    name: 'Gudang Logistik Modern',
    location: 'Cikarang, Bekasi',
    client: 'PT Logistics Prima',
    status: 'drawing',
    type: 'Industri',
    rabValue: 'Rp 8.200.000.000',
    progress: 15,
    warnings: 1,
    health: 88,
    startDate: '15 Jun 2026',
    dueDate: '15 Mar 2027',
    lastActivity: '3 hari lalu',
    description: 'Gudang logistik 5.000m², struktur baja, lantai heavy duty',
  },
  {
    id: 'proj-006',
    name: 'Cluster Perumahan Griya Asri',
    location: 'Cibubur, Jakarta Timur',
    client: 'PT Griya Asri Developer',
    status: 'draft',
    type: 'Residensial',
    rabValue: 'Rp 24.500.000.000',
    progress: 5,
    warnings: 0,
    health: 95,
    startDate: '-',
    dueDate: '-',
    lastActivity: '5 hari lalu',
    description: 'Cluster 20 unit rumah tipe 45/90, fasilitas umum, jalan lingkungan',
  },
];

function getStatusBadge(status: string) {
  const map: Record<string, { label: string; className: string }> = {
    active: { label: 'Aktif', className: 'badge-green' },
    'rab-review': { label: 'RAB Review', className: 'badge-amber' },
    scheduling: { label: 'Scheduling', className: 'badge-blue' },
    draft: { label: 'Draft', className: 'badge-slate' },
    drawing: { label: 'Drawing', className: 'badge-purple' },
  };
  return map[status] || { label: status, className: 'badge-slate' };
}

function getTypeBadge(type: string) {
  const map: Record<string, string> = {
    Residensial: 'badge-blue',
    Komersial: 'badge-purple',
    Industri: 'badge-amber',
    Ibadah: 'badge-green',
  };
  return map[type] || 'badge-slate';
}

export default function ProyekPage() {
  return (
    <div className="space-y-6 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Proyek</h1>
          <p className="text-sm text-paax-text-muted mt-1">Kelola semua proyek konstruksi Anda</p>
        </div>
        <button className="btn-primary">
          <Plus className="w-4 h-4" />
          Buat Proyek Baru
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-paax-text-muted" />
          <input
            type="text"
            placeholder="Cari nama proyek, lokasi, klien..."
            className="input-field pl-10 text-[13px]"
          />
        </div>
        <button className="btn-secondary text-[13px]">
          <Filter className="w-4 h-4" />
          Filter
        </button>
        <div className="flex items-center gap-1 ml-auto bg-white/[0.03] rounded-lg p-1 border border-white/[0.06]">
          <button className="p-1.5 rounded-md bg-white/[0.06] text-white">
            <LayoutGrid className="w-4 h-4" />
          </button>
          <button className="p-1.5 rounded-md text-paax-text-muted hover:text-white transition-colors">
            <List className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total Proyek', value: '12', sub: '6 aktif' },
          { label: 'Total RAB', value: 'Rp 50,9M', sub: '+12% bulan ini' },
          { label: 'Avg. Health', value: '83%', sub: 'Above target' },
          { label: 'Total Warnings', value: '17', sub: '3 critical' },
        ].map((stat) => (
          <div key={stat.label} className="stat-card py-3 px-4">
            <div className="text-[10px] text-paax-text-muted uppercase tracking-wider">{stat.label}</div>
            <div className="text-lg font-bold text-white mt-0.5">{stat.value}</div>
            <div className="text-[10px] text-paax-text-muted">{stat.sub}</div>
          </div>
        ))}
      </div>

      {/* Project Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {projects.map((project) => {
          const statusBadge = getStatusBadge(project.status);
          return (
            <Link
              key={project.id}
              href={`/proyek/${project.id}`}
              className="glass-card p-5 group cursor-pointer"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="min-w-0 flex-1">
                  <h3 className="text-[14px] font-semibold text-white group-hover:text-indigo-300 transition-colors truncate">
                    {project.name}
                  </h3>
                  <div className="flex items-center gap-1.5 mt-1">
                    <MapPin className="w-3 h-3 text-paax-text-muted" />
                    <span className="text-[11px] text-paax-text-muted">{project.location}</span>
                  </div>
                </div>
                <span className={`badge ${statusBadge.className} text-[9px] flex-shrink-0 ml-2`}>{statusBadge.label}</span>
              </div>

              <p className="text-[11px] text-paax-text-muted mb-3 line-clamp-2">{project.description}</p>

              <div className="flex items-center gap-2 mb-3">
                <span className={`badge ${getTypeBadge(project.type)} text-[9px]`}>{project.type}</span>
                <span className="text-[11px] text-paax-text-muted">· {project.client}</span>
              </div>

              <div className="text-lg font-bold text-white mb-3">{project.rabValue}</div>

              {/* Progress */}
              <div className="mb-3">
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="text-paax-text-muted">Progress</span>
                  <span className="text-white font-medium">{project.progress}%</span>
                </div>
                <div className="progress-bar">
                  <div
                    className={`progress-bar-fill ${
                      project.progress >= 80 ? 'bg-emerald-500' : project.progress >= 50 ? 'bg-blue-500' : 'bg-amber-500'
                    }`}
                    style={{ width: `${project.progress}%` }}
                  />
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between pt-3 border-t border-white/[0.04]">
                <div className="flex items-center gap-3 text-[10px]">
                  <div className="flex items-center gap-1 text-amber-400">
                    <AlertTriangle className="w-3 h-3" />
                    <span>{project.warnings} warnings</span>
                  </div>
                  <div className={`flex items-center gap-1 ${project.health >= 80 ? 'text-emerald-400' : project.health >= 70 ? 'text-amber-400' : 'text-red-400'}`}>
                    <Activity className="w-3 h-3" />
                    <span>{project.health}% health</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 text-[10px] text-paax-text-muted">
                  <Calendar className="w-3 h-3" />
                  <span>{project.lastActivity}</span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
