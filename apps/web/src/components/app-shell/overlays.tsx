'use client';

import { useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { UploadCloud } from 'lucide-react';
import { Drawer } from '@/components/ui/drawer';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { useShell } from './shell-context';
import { SettingsDialog } from './settings-dialog';
import { useProjects } from '@/lib/projects/projects-context';

export function WorkspaceOverlays() {
  const router = useRouter();
  const { current, closeOverlay } = useShell();
  const { createProject, backend } = useProjects();
  const [form, setForm] = useState({ name: '', location: '', client: '', type: 'Gedung', description: '' });
  const [savingProject, setSavingProject] = useState(false);
  const [projectError, setProjectError] = useState<string | null>(null);

  async function handleCreateProject() {
    if (!form.name.trim()) {
      setProjectError('Nama proyek wajib diisi.');
      return;
    }

    setSavingProject(true);
    setProjectError(null);
    try {
      const project = await createProject(form);
      setForm({ name: '', location: '', client: '', type: 'Gedung', description: '' });
      closeOverlay();
      router.push(`/proyek/${project.id}`);
    } catch (error) {
      setProjectError(error instanceof Error ? error.message : 'Gagal menyimpan proyek.');
    } finally {
      setSavingProject(false);
    }
  }

  return (
    <>
      {/* Notifikasi/Aplikasi/Tagihan/Akun kini hidup di dialog pengaturan terpusat */}
      <SettingsDialog />

      <Drawer open={current === 'upload'} onClose={closeOverlay} title="Unggah File">
        <div
          style={{
            border: '1.5px dashed var(--border)',
            borderRadius: 14,
            padding: '36px 16px',
            textAlign: 'center',
            color: 'var(--text3)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <UploadCloud size={28} />
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text2)' }}>Tarik file ke sini</div>
          <div style={{ fontSize: 12 }}>PDF, DWG, gambar, atau spreadsheet - maks 50 MB</div>
          <Button variant="secondary" style={{ marginTop: 8 }}>Pilih File</Button>
        </div>
        <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 10 }}>Tampilan contoh - unggahan belum tersambung ke backend.</p>
      </Drawer>

      <Modal
        open={current === 'newProject'}
        onClose={closeOverlay}
        title="Buat Proyek Baru"
        footer={
          <>
            <Button variant="secondary" onClick={closeOverlay}>Batal</Button>
            <Button onClick={handleCreateProject} disabled={savingProject}>
              {savingProject ? 'Menyimpan...' : 'Simpan'}
            </Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ margin: 0, fontSize: 11, color: 'var(--text3)' }}>
            Penyimpanan aktif: {backend === 'firestore' ? 'Firestore' : 'localStorage fallback'}.
          </p>
          <Field label="Nama Proyek">
            <input className="pax-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="mis. Gedung Kuliah Terpadu" />
          </Field>
          <Field label="Lokasi">
            <input className="pax-input" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Kota, Provinsi" />
          </Field>
          <Field label="Klien / Owner">
            <input className="pax-input" value={form.client} onChange={(e) => setForm({ ...form, client: e.target.value })} placeholder="mis. Dinas PUPR / PT ..." />
          </Field>
          <Field label="Tipe Proyek">
            <select className="pax-input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option>Gedung</option>
              <option>Infrastruktur</option>
              <option>Renovasi</option>
            </select>
          </Field>
          <Field label="Deskripsi">
            <textarea className="pax-input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Ringkasan lingkup pekerjaan" rows={3} />
          </Field>
          {projectError && <p style={{ margin: 0, fontSize: 11, color: 'var(--dng-dot)' }}>{projectError}</p>}
        </div>
      </Modal>
    </>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text2)' }}>{label}</span>
      {children}
    </label>
  );
}
