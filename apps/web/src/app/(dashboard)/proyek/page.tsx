'use client';

import type { MouseEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Edit3, MapPin, Plus, Trash2, Search, MessageSquare, FileImage } from 'lucide-react';
import { Card, StatusPill, Button, PageHeader, EmptyState } from '@/components/ui';
import { useShell } from '@/components/app-shell/shell-context';
import { useProjects } from '@/lib/projects/projects-context';
import { PROJECT_STATUS_LABEL, PROJECT_STATUS_TONE, type Project } from '@/lib/projects/types';

function rabDisplay(project: Project): string {
  return project.rabValue === null ? 'Belum dihitung' : project.rabValue.toLocaleString('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });
}

// Stats removed for clean chat UI concept

export default function ProyekPage() {
  const router = useRouter();
  const { openOverlay } = useShell();
  const { projects, loading, error, backend, updateProject, deleteProject } = useProjects();

  async function handleRename(project: Project, event: MouseEvent) {
    event.stopPropagation();
    const name = window.prompt('Nama proyek baru', project.name);
    if (!name || name.trim() === project.name) return;
    await updateProject(project.id, { name });
  }

  async function handleDelete(project: Project, event: MouseEvent) {
    event.stopPropagation();
    const confirmed = window.confirm(`Hapus proyek "${project.name}"?`);
    if (!confirmed) return;
    await deleteProject(project.id);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text)', margin: 0, fontFamily: 'var(--font-display)' }}>Projects</h1>
        <Button onClick={() => openOverlay('newProject')} style={{ borderRadius: 8, padding: '8px 16px' }}>
          <Plus size={16} style={{ marginRight: 6 }} /> New project
        </Button>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <input 
            className="pax-input" 
            placeholder="Search projects..." 
            style={{ paddingLeft: 36, background: 'var(--surface)', borderColor: 'var(--border)' }} 
          />
          <Search size={16} color="var(--text3)" style={{ position: 'absolute', left: 12, top: 11 }} />
        </div>
        <select className="pax-input" style={{ width: 180, background: 'var(--surface)', borderColor: 'var(--border)' }}>
          <option>Sort by Last updated</option>
          <option>Sort by Name</option>
          <option>Sort by Status</option>
        </select>
      </div>

      {error && (
        <Card padding={14} style={{ borderColor: 'var(--dng-dot)', marginBottom: 16 }}>
          <span style={{ fontSize: 12, color: 'var(--dng-dot)' }}>{error}</span>
        </Card>
      )}

      {loading ? (
        <Card padding={18}>
          <EmptyState title="Memuat proyek..." message="PAAX sedang membaca workspace proyek." />
        </Card>
      ) : projects.length === 0 ? (
        <Card padding={18}>
          <EmptyState
            icon={<Plus size={28} />}
            title="Belum ada proyek"
            message="Buat proyek pertama untuk mulai menyimpan metadata workspace. RAB tetap dihitung lewat Core Engine."
          />
        </Card>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }} className="pax-grid-3">
          {projects.map((p) => (
            <Card key={p.id} hover padding={20} onClick={() => router.push(`/chat/${p.id}`)}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, height: '100%' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>{p.name}</div>
                  <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.5, minHeight: 40, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {p.description || 'No description provided'}
                  </div>
                </div>
                
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto', paddingTop: 16, borderTop: '1px solid var(--border-soft)' }}>
                  <div style={{ fontSize: 12, color: 'var(--text3)' }}>
                    Updated {new Date(p.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'var(--text3)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <MessageSquare size={14} /> <span style={{ fontSize: 12 }}>3</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <FileImage size={14} /> <span style={{ fontSize: 12 }}>2</span>
                    </div>
                    
                    {/* Keep edit and delete accessible */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 8 }}>
                      <button aria-label="Edit proyek" onClick={(event) => handleRename(p, event)} style={{ border: 0, background: 'transparent', color: 'var(--text3)', cursor: 'pointer', padding: 4 }}>
                        <Edit3 size={14} />
                      </button>
                      <button aria-label="Hapus proyek" onClick={(event) => handleDelete(p, event)} style={{ border: 0, background: 'transparent', color: 'var(--text3)', cursor: 'pointer', padding: 4 }}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
