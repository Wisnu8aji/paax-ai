'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Building2, MapPin, ArrowRight } from 'lucide-react';
import { LocalStorage, STORAGE_KEYS } from '@/lib/local-storage';

export default function GambarKerjaAIGlobalPage() {
  const [projects, setProjects] = useState<any[]>([]);

  useEffect(() => {
    setProjects(LocalStorage.get<any[]>(STORAGE_KEYS.PROJECTS, []));
  }, []);

  return (
    <div className="space-y-6 max-w-[1400px]">
      <div>
        <h1 className="text-2xl font-bold text-white">Pilih Proyek untuk Gambar Kerja AI</h1>
        <p className="text-sm text-paax-text-muted mt-1">Pilih proyek terlebih dahulu sebelum menganalisis gambar kerja.</p>
      </div>

      {projects.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {projects.map((project) => (
            <Link key={project.id} href={`/proyek/${project.id}/gambar-kerja`} className="glass-card p-5 group">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-indigo-500/10 flex items-center justify-center flex-shrink-0">
                    <Building2 className="w-4 h-4 text-indigo-400" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-[14px] font-semibold text-white group-hover:text-indigo-300 transition-colors truncate">{project.name}</h2>
                    <div className="flex items-center gap-1.5 mt-1 text-[11px] text-paax-text-muted">
                      <MapPin className="w-3 h-3" />
                      <span className="truncate">{project.location || '-'}</span>
                    </div>
                    <p className="text-[11px] text-paax-text-muted mt-2">Klien: {project.client || '-'}</p>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-paax-text-muted group-hover:text-indigo-400 transition-colors flex-shrink-0" />
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="glass-card p-8 text-center">
          <Building2 className="w-10 h-10 text-paax-text-muted mx-auto mb-3" />
          <h2 className="text-white font-medium mb-1">Belum ada proyek</h2>
          <p className="text-[13px] text-paax-text-muted mb-4">Buat proyek terlebih dahulu untuk menggunakan Gambar Kerja AI.</p>
          <Link href="/proyek" className="btn-primary inline-flex">Buka Proyek</Link>
        </div>
      )}
    </div>
  );
}
