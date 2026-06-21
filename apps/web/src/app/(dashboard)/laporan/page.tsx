import React from 'react';
import { 
  FileSpreadsheet, 
  FileText, 
  Download, 
  Clock, 
  CheckCircle2,
  AlertCircle
} from 'lucide-react';

export default function LaporanExportPage() {
  const exports = [
    { id: 1, name: 'Laporan RAB Lengkap - Rumah Tinggal Pak Ahmad', type: 'excel', status: 'completed', date: '21 Jun 2026, 14:30', size: '1.2 MB' },
    { id: 2, name: 'Executive Summary - Gedung Kantor BSD', type: 'pdf', status: 'completed', date: '20 Jun 2026, 09:15', size: '450 KB' },
    { id: 3, name: 'Kurva S & Jadwal - Renovasi Ruko', type: 'excel', status: 'failed', date: '19 Jun 2026, 16:45', size: '-' },
    { id: 4, name: 'Analisa Harga Satuan - Rumah Tinggal Pak Ahmad', type: 'pdf', status: 'completed', date: '18 Jun 2026, 11:20', size: '2.1 MB' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Laporan & Export</h1>
        <p className="text-slate-400 text-sm mt-1">Generate laporan proyek standar profesional dalam format Excel dan PDF</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Templates */}
        <div className="lg:col-span-2 space-y-4">
          <h2 className="text-lg font-semibold text-white mb-4">Template Laporan</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Template Card 1 */}
            <div className="p-5 bg-slate-900 border border-slate-800 rounded-xl hover:border-indigo-500/50 transition-colors group">
              <div className="flex items-start justify-between mb-4">
                <div className="p-3 bg-emerald-500/10 rounded-lg text-emerald-400 group-hover:bg-emerald-500/20 transition-colors">
                  <FileSpreadsheet className="w-6 h-6" />
                </div>
                <span className="text-xs font-medium px-2 py-1 bg-slate-800 text-slate-300 rounded-md">Excel</span>
              </div>
              <h3 className="font-semibold text-white mb-1">RAB & BOQ Lengkap</h3>
              <p className="text-sm text-slate-400 mb-4 leading-relaxed">Format standar PUPR dengan sheet Rekapitulasi, Rincian RAB, AHSP, dan Daftar Harga Dasar.</p>
              <button className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium rounded-lg transition-colors border border-slate-700">
                Pilih Proyek & Generate
              </button>
            </div>

            {/* Template Card 2 */}
            <div className="p-5 bg-slate-900 border border-slate-800 rounded-xl hover:border-indigo-500/50 transition-colors group">
              <div className="flex items-start justify-between mb-4">
                <div className="p-3 bg-red-500/10 rounded-lg text-red-400 group-hover:bg-red-500/20 transition-colors">
                  <FileText className="w-6 h-6" />
                </div>
                <span className="text-xs font-medium px-2 py-1 bg-slate-800 text-slate-300 rounded-md">PDF</span>
              </div>
              <h3 className="font-semibold text-white mb-1">Executive Summary</h3>
              <p className="text-sm text-slate-400 mb-4 leading-relaxed">Ringkasan eksekutif berisi profil proyek, nilai total RAB, jadwal makro, dan indikator risiko.</p>
              <button className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium rounded-lg transition-colors border border-slate-700">
                Pilih Proyek & Generate
              </button>
            </div>

            {/* Template Card 3 */}
            <div className="p-5 bg-slate-900 border border-slate-800 rounded-xl hover:border-indigo-500/50 transition-colors group">
              <div className="flex items-start justify-between mb-4">
                <div className="p-3 bg-emerald-500/10 rounded-lg text-emerald-400 group-hover:bg-emerald-500/20 transition-colors">
                  <FileSpreadsheet className="w-6 h-6" />
                </div>
                <span className="text-xs font-medium px-2 py-1 bg-slate-800 text-slate-300 rounded-md">Excel</span>
              </div>
              <h3 className="font-semibold text-white mb-1">Jadwal & Kurva S</h3>
              <p className="text-sm text-slate-400 mb-4 leading-relaxed">Time schedule lengkap dengan Barchart, Kurva S Rencana, dan pembobotan per item pekerjaan.</p>
              <button className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium rounded-lg transition-colors border border-slate-700">
                Pilih Proyek & Generate
              </button>
            </div>

            {/* Template Card 4 */}
            <div className="p-5 bg-slate-900 border border-slate-800 rounded-xl hover:border-indigo-500/50 transition-colors group">
              <div className="flex items-start justify-between mb-4">
                <div className="p-3 bg-red-500/10 rounded-lg text-red-400 group-hover:bg-red-500/20 transition-colors">
                  <FileText className="w-6 h-6" />
                </div>
                <span className="text-xs font-medium px-2 py-1 bg-slate-800 text-slate-300 rounded-md">PDF</span>
              </div>
              <h3 className="font-semibold text-white mb-1">Laporan Progress Site</h3>
              <p className="text-sm text-slate-400 mb-4 leading-relaxed">Laporan harian/mingguan otomatis lengkap dengan dokumentasi foto dan catatan lapangan.</p>
              <button className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium rounded-lg transition-colors border border-slate-700">
                Pilih Proyek & Generate
              </button>
            </div>
          </div>
        </div>

        {/* Export History */}
        <div className="lg:col-span-1">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 sticky top-6">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Clock className="w-5 h-5 text-slate-400" />
              Riwayat Export
            </h2>
            <div className="space-y-4">
              {exports.map((item) => (
                <div key={item.id} className="p-3 bg-slate-800/50 border border-slate-700/50 rounded-lg">
                  <div className="flex gap-3">
                    <div className="mt-1">
                      {item.type === 'excel' ? (
                        <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
                      ) : (
                        <FileText className="w-5 h-5 text-red-400" />
                      )}
                    </div>
                    <div className="flex-1">
                      <h4 className="text-sm font-medium text-slate-200 line-clamp-2 leading-tight mb-1">{item.name}</h4>
                      <div className="flex items-center gap-2 text-xs text-slate-500 mb-2">
                        <span>{item.date}</span>
                        <span>•</span>
                        <span>{item.size}</span>
                      </div>
                      {item.status === 'completed' ? (
                        <button className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 transition-colors">
                          <Download className="w-3 h-3" /> Download
                        </button>
                      ) : (
                        <span className="flex items-center gap-1 text-xs text-red-400">
                          <AlertCircle className="w-3 h-3" /> Gagal Generate
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <button className="w-full mt-4 py-2 text-sm text-slate-400 hover:text-slate-300 transition-colors">
              Lihat Semua Riwayat
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
