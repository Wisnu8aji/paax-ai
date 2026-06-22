'use client';

import { useState, useEffect } from 'react';
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
  X
} from 'lucide-react';
import { LocalStorage, STORAGE_KEYS } from '@/lib/local-storage';
import { formatRupiah } from '@/lib/format';

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
  const [projects, setProjects] = useState<any[]>([]);
  const [selectModule, setSelectModule] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    location: '',
    client: '',
    type: 'Residensial',
    description: '',
    budget: 0,
  });

  useEffect(() => {
    const savedProjects = LocalStorage.get<any[]>(STORAGE_KEYS.PROJECTS, []);
    setProjects(savedProjects);
    const requestedModule = new URLSearchParams(window.location.search).get('selectModule');
    const validModules = ['rab', 'schedule', 'chat', 'site-agent', 'gambar-kerja'];
    setSelectModule(requestedModule && validModules.includes(requestedModule) ? requestedModule : null);
  }, []);

  const handleCreateProject = (e: React.FormEvent) => {
    e.preventDefault();
    const newProject = {
      id: `proj-${Date.now()}`,
      name: formData.name,
      location: formData.location,
      client: formData.client,
      status: 'draft',
      type: formData.type,
      rabValue: formData.budget,
      progress: 0,
      warnings: 0,
      health: 100,
      startDate: '-',
      dueDate: '-',
      lastActivity: 'Baru saja',
      description: formData.description,
      created_at: new Date().toISOString()
    };

    const updatedProjects = [newProject, ...projects];
    setProjects(updatedProjects);
    LocalStorage.set(STORAGE_KEYS.PROJECTS, updatedProjects);
    setIsModalOpen(false);
    setFormData({ name: '', location: '', client: '', type: 'Residensial', description: '', budget: 0 });
  };

  const totalRab = projects.reduce((sum, p) => sum + (p.rabValue || 0), 0);
  const activeCount = projects.filter((p) => p.status === 'active').length;

  return (
    <div className="space-y-6 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Proyek</h1>
          <p className="text-sm text-paax-text-muted mt-1">Kelola semua proyek konstruksi Anda</p>
        </div>
        <button className="btn-primary" onClick={() => setIsModalOpen(true)}>
          <Plus className="w-4 h-4" />
          Buat Proyek Baru
        </button>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total Proyek', value: projects.length.toString(), sub: `${activeCount} aktif` },
          { label: 'Total RAB', value: formatRupiah(totalRab), sub: 'Estimasi nilai proyek' },
          { label: 'Avg. Health', value: '83%', sub: 'Above target' },
          { label: 'Total Warnings', value: projects.reduce((sum, p) => sum + (p.warnings || 0), 0).toString(), sub: 'Across all' },
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
              href={`/proyek/${project.id}${selectModule ? `/${selectModule}` : ''}`}
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

              <div className="text-lg font-bold text-white mb-3">{formatRupiah(project.rabValue)}</div>

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

      {projects.length === 0 && (
        <div className="text-center py-20 bg-white/[0.02] border border-white/[0.04] rounded-xl">
          <Building2 className="w-10 h-10 text-paax-text-muted mx-auto mb-3" />
          <h3 className="text-white font-medium mb-1">Belum ada proyek</h3>
          <p className="text-[13px] text-paax-text-muted mb-4">Buat proyek pertama Anda untuk mulai menggunakan PAAX AI.</p>
          <button className="btn-primary" onClick={() => setIsModalOpen(true)}>
            <Plus className="w-4 h-4" />
            Buat Proyek
          </button>
        </div>
      )}

      {/* Modal Buat Proyek */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-900 border border-white/[0.08] rounded-xl w-full max-w-lg shadow-2xl overflow-hidden animate-fade-in">
            <div className="flex items-center justify-between p-4 border-b border-white/[0.08]">
              <h2 className="text-lg font-bold text-white">Buat Proyek Baru</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-paax-text-muted hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleCreateProject} className="p-4 space-y-4">
              <div className="space-y-1">
                <label className="text-[12px] font-medium text-paax-text-secondary">Nama Proyek</label>
                <input required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} type="text" className="input-field" placeholder="Misal: Pembangunan Rumah Tinggal" />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[12px] font-medium text-paax-text-secondary">Lokasi</label>
                  <input required value={formData.location} onChange={e => setFormData({...formData, location: e.target.value})} type="text" className="input-field" placeholder="Misal: Jakarta Selatan" />
                </div>
                <div className="space-y-1">
                  <label className="text-[12px] font-medium text-paax-text-secondary">Nama Klien</label>
                  <input required value={formData.client} onChange={e => setFormData({...formData, client: e.target.value})} type="text" className="input-field" placeholder="Misal: Bp. Budi" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[12px] font-medium text-paax-text-secondary">Tipe Proyek</label>
                  <select value={formData.type} onChange={e => setFormData({...formData, type: e.target.value})} className="input-field appearance-none">
                    <option value="Residensial">Residensial</option>
                    <option value="Komersial">Komersial</option>
                    <option value="Industri">Industri</option>
                    <option value="Ibadah">Ibadah</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[12px] font-medium text-paax-text-secondary">Estimasi Budget Awal (Opsional)</label>
                  <input value={formData.budget} onChange={e => setFormData({...formData, budget: Number(e.target.value)})} type="number" className="input-field" placeholder="0" />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[12px] font-medium text-paax-text-secondary">Deskripsi Singkat</label>
                <textarea value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} className="input-field h-20 py-2 resize-none" placeholder="Deskripsikan ruang lingkup proyek..."></textarea>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-white/[0.08]">
                <button type="button" onClick={() => setIsModalOpen(false)} className="btn-secondary">Batal</button>
                <button type="submit" className="btn-primary">Buat Proyek</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
