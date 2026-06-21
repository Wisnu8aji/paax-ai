'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
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
import { LocalStorage, STORAGE_KEYS } from '@/lib/local-storage';
import { formatRupiah, formatDate } from '@/lib/format';

const projectMilestones = [
  { name: 'Pekerjaan Persiapan', status: 'completed', progress: 100, date: '15 Mar 2026' },
  { name: 'Pekerjaan Pondasi', status: 'completed', progress: 100, date: '10 Apr 2026' },
  { name: 'Pekerjaan Struktur Lt.1', status: 'active', progress: 75, date: '20 May 2026' },
  { name: 'Pekerjaan Struktur Lt.2', status: 'upcoming', progress: 10, date: '15 Jun 2026' },
  { name: 'Pekerjaan Atap', status: 'upcoming', progress: 0, date: '01 Jul 2026' },
];

const recentActivities = [
  { action: 'Proyek Dibuat', detail: 'Inisiasi proyek di PAAX', time: 'Baru saja', user: 'System' },
];

export default function ProjectOverviewPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [project, setProject] = useState<any>(null);

  useEffect(() => {
    const savedProjects = LocalStorage.get<any[]>(STORAGE_KEYS.PROJECTS, []);
    const found = savedProjects.find(p => p.id === projectId);
    if (found) {
      setProject(found);
      // Set as current project globally
      LocalStorage.set(STORAGE_KEYS.CURRENT_PROJECT, found);
    }
  }, [projectId]);

  if (!project) {
    return (
      <div className="flex items-center justify-center py-20 text-paax-text-muted">
        Memuat data proyek...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-2">
            <Calculator className="w-4 h-4 text-indigo-400" />
            <span className="text-[11px] text-paax-text-muted uppercase tracking-wider">Nilai RAB</span>
          </div>
          <div className="text-xl font-bold text-white">{formatRupiah(project.rabValue)}</div>
          <div className="text-[10px] text-emerald-400 mt-1">{project.status === 'active' ? 'Approved' : 'Estimasi'}</div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-2">
            <Activity className="w-4 h-4 text-emerald-400" />
            <span className="text-[11px] text-paax-text-muted uppercase tracking-wider">Progress</span>
          </div>
          <div className="text-xl font-bold text-white">{project.progress}%</div>
          <div className="progress-bar mt-2">
            <div className="progress-bar-fill bg-gradient-to-r from-indigo-500 to-blue-500" style={{ width: `${project.progress}%` }} />
          </div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            <span className="text-[11px] text-paax-text-muted uppercase tracking-wider">Warnings</span>
          </div>
          <div className="text-xl font-bold text-white">{project.warnings}</div>
          <div className="text-[10px] text-amber-400 mt-1">Status: {project.health}% Health</div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-4 h-4 text-blue-400" />
            <span className="text-[11px] text-paax-text-muted uppercase tracking-wider">Deadline</span>
          </div>
          <div className="text-xl font-bold text-white">{project.dueDate !== '-' ? project.dueDate : 'TBD'}</div>
          <div className="text-[10px] text-paax-text-muted mt-1">{project.startDate !== '-' ? `Mulai: ${project.startDate}` : 'Belum dimulai'}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Project Info */}
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Informasi Proyek</h3>
          <div className="space-y-3">
            {[
              { icon: Building2, label: 'Nama', value: project.name },
              { icon: Building2, label: 'Tipe', value: project.type },
              { icon: MapPin, label: 'Lokasi', value: project.location },
              { icon: User, label: 'Klien', value: project.client },
              { icon: Layers, label: 'Kategori', value: 'Standar' },
              { icon: Calendar, label: 'Dibuat', value: formatDate(project.created_at) },
            ].map((item, i) => {
              const Icon = item.icon;
              return (
                <div key={i} className="flex items-center justify-between py-1.5">
                  <div className="flex items-center gap-2">
                    <Icon className="w-3.5 h-3.5 text-paax-text-muted" />
                    <span className="text-[12px] text-paax-text-muted">{item.label}</span>
                  </div>
                  <span className="text-[12px] text-paax-text-secondary font-medium text-right max-w-[60%]">{item.value}</span>
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
    </div>
  );
}
