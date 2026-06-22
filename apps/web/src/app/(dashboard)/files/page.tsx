'use client';

import React, { useState, useEffect } from 'react';
import { 
  File, 
  FolderOpen, 
  UploadCloud, 
  MoreVertical, 
  Search,
  Filter,
  FileText,
  Image as ImageIcon,
  FileSpreadsheet,
  X
} from 'lucide-react';
import { DRAWING_STORAGE_KEYS, LocalStorage, projectStorageKey, STORAGE_KEYS } from '@/lib/local-storage';

export default function FilesPage() {
  const [files, setFiles] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadForm, setUploadForm] = useState({
    name: '',
    project_id: '',
    type: 'pdf',
  });

  useEffect(() => {
    // Load Projects
    const savedProjects = LocalStorage.get<any[]>(STORAGE_KEYS.PROJECTS, []);
    setProjects(savedProjects);
    if (savedProjects.length > 0 && !uploadForm.project_id) {
      setUploadForm(prev => ({...prev, project_id: savedProjects[0].id}));
    }

    // Load Files
    const savedFiles = LocalStorage.get<any[]>('paax_files', [
      { id: 1, name: 'Gambar_Kerja_Arsitektur_v2.pdf', type: 'pdf', size: '4.2 MB', date: '20 Jun 2026', project_id: 'default', project_name: 'Rumah Tinggal Pak Ahmad', author: 'Budi Santoso' },
      { id: 2, name: 'RAB_Draft_Initial.xlsx', type: 'excel', size: '1.1 MB', date: '19 Jun 2026', project_id: 'default', project_name: 'Rumah Tinggal Pak Ahmad', author: 'System AI' },
    ]);

    // Load Drawing Files from v0.5 workflow
    const drawingFiles = savedProjects.flatMap(project =>
      LocalStorage.get<any[]>(projectStorageKey(DRAWING_STORAGE_KEYS.FILES, project.id), [])
        .map(file => ({ ...file, project_name: project.name })),
    );
    const mappedDrawingFiles = drawingFiles.map((df, idx) => ({
      id: `drawing-${df.project_id}-${idx}`,
      name: df.name,
      type: df.type === 'DRAWING_PDF' ? 'pdf' : df.type === 'IMAGE' ? 'image' : 'pdf',
      size: 'AI Processed',
      date: new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }),
      project_id: df.project_id,
      project_name: df.project_name,
      author: 'PAAX Document Intelligence'
    }));

    setFiles([...mappedDrawingFiles, ...savedFiles]);
  }, []);

  const getFileIcon = (type: string) => {
    switch(type) {
      case 'pdf': return <FileText className="w-8 h-8 text-red-400" />;
      case 'excel': return <FileSpreadsheet className="w-8 h-8 text-emerald-400" />;
      case 'image': return <ImageIcon className="w-8 h-8 text-blue-400" />;
      default: return <File className="w-8 h-8 text-slate-400" />;
    }
  };

  const handleUpload = (e: React.FormEvent) => {
    e.preventDefault();
    const project = projects.find(p => p.id === uploadForm.project_id);
    const newFile = {
      id: Date.now(),
      name: uploadForm.name,
      type: uploadForm.type,
      size: (Math.random() * 5 + 0.5).toFixed(1) + ' MB',
      date: new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }),
      project_id: uploadForm.project_id,
      project_name: project ? project.name : 'Unknown Project',
      author: 'User',
    };

    const updatedFiles = [newFile, ...files];
    setFiles(updatedFiles);
    LocalStorage.set('paax_files', updatedFiles);
    setIsUploadModalOpen(false);
    setUploadForm({ ...uploadForm, name: '' });
  };

  return (
    <div className="space-y-6 max-w-[1400px]">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">File & Dokumen</h1>
          <p className="text-paax-text-muted text-sm mt-1">Manajemen terpusat untuk semua dokumen proyek</p>
        </div>
        <button onClick={() => setIsUploadModalOpen(true)} className="btn-primary text-sm">
          <UploadCloud className="w-4 h-4" />
          Upload Dokumen
        </button>
      </div>

      {/* Folders Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {['Gambar Kerja', 'RAB & BOQ', 'Laporan Harian', 'Kontrak & Legal'].map((folder, idx) => (
          <div key={idx} className="p-4 bg-slate-900 border border-slate-800 rounded-xl hover:border-slate-600 transition-colors cursor-pointer group">
            <div className="flex justify-between items-start mb-3">
              <FolderOpen className="w-8 h-8 text-indigo-400 group-hover:text-indigo-300 transition-colors" />
              <button className="text-slate-500 hover:text-slate-300">
                <MoreVertical className="w-4 h-4" />
              </button>
            </div>
            <h3 className="font-medium text-slate-200 text-sm">{folder}</h3>
            <p className="text-xs text-slate-500 mt-1">{12 + idx * 5} files</p>
          </div>
        ))}
      </div>

      {/* File List */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="relative w-full sm:w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="Cari nama file, proyek, atau tipe..." 
              className="input-field pl-10 text-[13px] w-full"
            />
          </div>
          <button className="btn-secondary text-sm w-full sm:w-auto justify-center">
            <Filter className="w-4 h-4" />
            Filter
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead>
              <tr className="bg-slate-800/50 text-slate-400 text-xs uppercase tracking-wider">
                <th className="p-4 font-medium">Nama Dokumen</th>
                <th className="p-4 font-medium">Proyek</th>
                <th className="p-4 font-medium">Diunggah Oleh</th>
                <th className="p-4 font-medium">Tanggal</th>
                <th className="p-4 font-medium">Ukuran</th>
                <th className="p-4 font-medium"></th>
              </tr>
            </thead>
            <tbody className="text-sm divide-y divide-slate-800/50">
              {files.map((file) => (
                <tr key={file.id} className="hover:bg-slate-800/30 transition-colors group">
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      {getFileIcon(file.type)}
                      <span className="font-medium text-slate-200 cursor-pointer group-hover:text-indigo-400 transition-colors">{file.name}</span>
                    </div>
                  </td>
                  <td className="p-4 text-slate-400">{file.project_name}</td>
                  <td className="p-4 text-slate-400">{file.author}</td>
                  <td className="p-4 text-slate-400">{file.date}</td>
                  <td className="p-4 text-slate-400">{file.size}</td>
                  <td className="p-4 text-right">
                    <button className="p-2 text-slate-500 hover:text-slate-300 rounded-lg hover:bg-slate-800 transition-colors">
                      <MoreVertical className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Upload Modal */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-900 border border-white/[0.08] rounded-xl w-full max-w-md shadow-2xl overflow-hidden animate-fade-in">
            <div className="flex items-center justify-between p-4 border-b border-white/[0.08]">
              <h2 className="text-lg font-bold text-white">Upload Dokumen (Mock)</h2>
              <button onClick={() => setIsUploadModalOpen(false)} className="text-paax-text-muted hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleUpload} className="p-4 space-y-4">
              <div className="space-y-1">
                <label className="text-[12px] font-medium text-paax-text-secondary">Nama Dokumen</label>
                <input required value={uploadForm.name} onChange={e => setUploadForm({...uploadForm, name: e.target.value})} type="text" className="input-field" placeholder="Misal: Denah_Lantai_1.pdf" />
              </div>
              
              <div className="space-y-1">
                <label className="text-[12px] font-medium text-paax-text-secondary">Proyek</label>
                <select value={uploadForm.project_id} onChange={e => setUploadForm({...uploadForm, project_id: e.target.value})} className="input-field appearance-none">
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                  {projects.length === 0 && <option value="default">Default Project</option>}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[12px] font-medium text-paax-text-secondary">Tipe Dokumen</label>
                <select value={uploadForm.type} onChange={e => setUploadForm({...uploadForm, type: e.target.value})} className="input-field appearance-none">
                  <option value="pdf">PDF</option>
                  <option value="excel">Excel</option>
                  <option value="image">Gambar / Foto</option>
                  <option value="doc">Word</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-white/[0.08]">
                <button type="button" onClick={() => setIsUploadModalOpen(false)} className="btn-secondary">Batal</button>
                <button type="submit" className="btn-primary">Upload Mock</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
