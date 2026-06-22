'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { ChevronDown, Building2, Check, MapPin } from 'lucide-react';
import { LocalStorage, STORAGE_KEYS } from '@/lib/local-storage';

interface ProjectSwitcherProps {
  currentProjectId: string;
}

export function ProjectSwitcher({ currentProjectId }: ProjectSwitcherProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [projects, setProjects] = useState<any[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const savedProjects = LocalStorage.get<any[]>(STORAGE_KEYS.PROJECTS, []);
    setProjects(savedProjects);
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const currentProject = projects.find(p => p.id === currentProjectId);

  const handleSwitchProject = (newProjectId: string) => {
    setIsOpen(false);
    if (newProjectId === currentProjectId) return;
    
    LocalStorage.setActiveProjectId(newProjectId);
    
    // Replace the old projectId in the pathname with the new one
    // example: /proyek/proj-001/gambar-kerja -> /proyek/proj-002/gambar-kerja
    const newPath = pathname.replace(`/proyek/${currentProjectId}`, `/proyek/${newProjectId}`);
    router.push(newPath);
  };

  if (!currentProject) return null;

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white/[0.02] border border-white/[0.05] hover:bg-white/[0.05] transition-all text-left"
      >
        <div className="w-8 h-8 rounded bg-gradient-to-br from-indigo-500/20 to-blue-500/20 border border-indigo-500/20 flex items-center justify-center flex-shrink-0">
          <Building2 className="w-4 h-4 text-indigo-400" />
        </div>
        <div className="flex-1 min-w-[150px]">
          <div className="text-[10px] text-paax-text-muted font-medium uppercase tracking-wider mb-0.5">Active Project</div>
          <div className="text-[13px] font-semibold text-white truncate pr-4">{currentProject.name}</div>
        </div>
        <ChevronDown className={`w-4 h-4 text-paax-text-muted transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-2 w-[280px] bg-[#0A0F1E] border border-white/[0.08] rounded-xl shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2">
          <div className="p-2 border-b border-white/[0.05]">
            <div className="text-[11px] font-medium text-paax-text-muted uppercase tracking-wider px-2 py-1">Pilih Proyek</div>
          </div>
          <div className="max-h-[300px] overflow-y-auto p-1.5 space-y-0.5">
            {projects.map(project => (
              <button
                key={project.id}
                onClick={() => handleSwitchProject(project.id)}
                className={`w-full flex items-center justify-between p-2 rounded-lg text-left transition-all ${
                  project.id === currentProjectId 
                    ? 'bg-indigo-500/10 border border-indigo-500/20' 
                    : 'hover:bg-white/[0.04] border border-transparent'
                }`}
              >
                <div className="min-w-0 pr-3">
                  <div className={`text-[13px] font-medium truncate ${project.id === currentProjectId ? 'text-indigo-300' : 'text-white'}`}>
                    {project.name}
                  </div>
                  <div className="flex items-center gap-1 mt-0.5 text-[11px] text-paax-text-muted">
                    <MapPin className="w-3 h-3" />
                    <span className="truncate">{project.location}</span>
                  </div>
                </div>
                {project.id === currentProjectId && (
                  <Check className="w-4 h-4 text-indigo-400 flex-shrink-0" />
                )}
              </button>
            ))}
            
            {projects.length === 0 && (
              <div className="px-3 py-4 text-center text-[12px] text-paax-text-muted">
                Tidak ada proyek lain.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
