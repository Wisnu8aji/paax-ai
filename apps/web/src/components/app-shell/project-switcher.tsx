'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { ChevronDown, Building2, Check, MapPin } from 'lucide-react';
import { LocalStorage } from '@/lib/local-storage';
import { useProjects } from '@/lib/projects/projects-context';

interface ProjectSwitcherProps {
  currentProjectId: string;
}

export function ProjectSwitcher({ currentProjectId }: ProjectSwitcherProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { projects } = useProjects();

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const currentProject =
    projects.find((p) => p.id === currentProjectId) ?? null;

  const handleSwitchProject = (newProjectId: string) => {
    setIsOpen(false);
    if (newProjectId === currentProjectId) return;
    LocalStorage.setActiveProjectId(newProjectId);
    router.push(pathname.replace(`/proyek/${currentProjectId}`, `/proyek/${newProjectId}`));
  };

  if (!currentProject) {
    return null;
  }

  return (
    <div style={{ position: 'relative' }} ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '8px 12px',
          borderRadius: 11,
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <span style={{ width: 30, height: 30, borderRadius: 9, background: 'var(--surface2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: 'var(--text2)' }}>
          <Building2 size={15} />
        </span>
        <span style={{ minWidth: 130 }}>
          <span style={{ display: 'block', fontSize: 9.5, color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Proyek Aktif</span>
          <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{currentProject.name}</span>
        </span>
        <ChevronDown size={15} color="var(--text3)" style={{ transform: isOpen ? 'rotate(180deg)' : undefined, transition: 'transform .15s' }} />
      </button>

      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            marginTop: 8,
            width: 280,
            background: 'var(--elev)',
            border: '1px solid var(--border)',
            borderRadius: 14,
            boxShadow: 'var(--shadow-modal)',
            zIndex: 50,
            overflow: 'hidden',
          }}
        >
          <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-soft)', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text3)' }}>
            Pilih Proyek
          </div>
          <div style={{ maxHeight: 300, overflowY: 'auto', padding: 6, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {projects.map((project) => {
              const active = project.id === currentProjectId;
              return (
                <button
                  key={project.id}
                  onClick={() => handleSwitchProject(project.id)}
                  className="pax-row-hover"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: 9, borderRadius: 10, textAlign: 'left', cursor: 'pointer', background: active ? 'var(--surface)' : 'transparent', border: `1px solid ${active ? 'var(--border)' : 'transparent'}` }}
                >
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{project.name}</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2, fontSize: 11, color: 'var(--text3)' }}>
                      <MapPin size={11} /> {project.location}
                    </span>
                  </span>
                  {active && <Check size={15} color="var(--accent)" style={{ flexShrink: 0 }} />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
