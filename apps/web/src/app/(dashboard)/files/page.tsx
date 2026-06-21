import React from 'react';
import { 
  File, 
  FolderOpen, 
  UploadCloud, 
  MoreVertical, 
  Search,
  Filter,
  FileText,
  Image as ImageIcon,
  FileSpreadsheet
} from 'lucide-react';

export default function FilesPage() {
  const files = [
    { id: 1, name: 'Gambar_Kerja_Arsitektur_v2.pdf', type: 'pdf', size: '4.2 MB', date: '20 Jun 2026', project: 'Rumah Tinggal Pak Ahmad', author: 'Budi Santoso' },
    { id: 2, name: 'RAB_Draft_Initial.xlsx', type: 'excel', size: '1.1 MB', date: '19 Jun 2026', project: 'Rumah Tinggal Pak Ahmad', author: 'System AI' },
    { id: 3, name: 'Dokumen_Kontrak_Final.docx', type: 'doc', size: '2.5 MB', date: '15 Jun 2026', project: 'Renovasi Ruko Sudirman', author: 'Admin' },
    { id: 4, name: 'Foto_Progress_M1.jpg', type: 'image', size: '3.8 MB', date: '14 Jun 2026', project: 'Gedung Kantor 3 Lantai', author: 'Site Agent' },
    { id: 5, name: 'Jadwal_Kurva_S.xlsx', type: 'excel', size: '850 KB', date: '12 Jun 2026', project: 'Renovasi Ruko Sudirman', author: 'System AI' },
    { id: 6, name: 'Spesifikasi_Teknis_MEP.pdf', type: 'pdf', size: '5.6 MB', date: '10 Jun 2026', project: 'Gedung Kantor 3 Lantai', author: 'Budi Santoso' },
  ];

  const getFileIcon = (type: string) => {
    switch(type) {
      case 'pdf': return <FileText className="w-8 h-8 text-red-400" />;
      case 'excel': return <FileSpreadsheet className="w-8 h-8 text-emerald-400" />;
      case 'image': return <ImageIcon className="w-8 h-8 text-blue-400" />;
      default: return <File className="w-8 h-8 text-slate-400" />;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">File & Dokumen</h1>
          <p className="text-slate-400 text-sm mt-1">Manajemen terpusat untuk semua dokumen proyek</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-indigo-600 rounded-lg text-sm font-medium text-white hover:bg-indigo-700 transition-colors">
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
              className="w-full bg-slate-800 border border-slate-700 text-sm text-slate-200 rounded-lg pl-9 pr-4 py-2 focus:outline-none focus:border-indigo-500"
            />
          </div>
          <button className="flex items-center gap-2 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-300 hover:bg-slate-700 transition-colors w-full sm:w-auto justify-center">
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
                  <td className="p-4 text-slate-400">{file.project}</td>
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
    </div>
  );
}
