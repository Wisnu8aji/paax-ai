import React from 'react';
import { 
  Sun, 
  Moon, 
  Camera, 
  MapPin, 
  CloudSun,
  ThermometerSun,
  Activity,
  AlertOctagon,
  CheckCircle,
  Clock,
  HardHat
} from 'lucide-react';

export default function SiteAgentPage() {
  const photos = [
    { url: 'https://images.unsplash.com/photo-1541888086425-d81bb19240f5?w=500&h=400&fit=crop', caption: 'Pengecoran plat lantai 1 zona A', time: '10:30 AM' },
    { url: 'https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=500&h=400&fit=crop', caption: 'Inspeksi pembesian kolom', time: '13:15 PM' },
    { url: 'https://images.unsplash.com/photo-1589939705384-5185137a7f0f?w=500&h=400&fit=crop', caption: 'Pekerjaan bekisting balok', time: '15:45 PM' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Site Agent AI</h1>
          <p className="text-slate-400 text-sm mt-1">Monitoring progres harian, pelaporan, dan rekomendasi lapangan</p>
        </div>
        <div className="flex items-center gap-3 bg-slate-800/80 px-4 py-2 rounded-xl border border-slate-700">
          <MapPin className="w-4 h-4 text-slate-400" />
          <span className="text-sm text-slate-300">Depok, Jawa Barat</span>
          <div className="h-4 w-px bg-slate-700 mx-1"></div>
          <CloudSun className="w-4 h-4 text-slate-400" />
          <span className="text-sm text-slate-300">Cerah Berawan</span>
          <div className="h-4 w-px bg-slate-700 mx-1"></div>
          <ThermometerSun className="w-4 h-4 text-slate-400" />
          <span className="text-sm text-slate-300">32°C</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Morning Plan */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden flex flex-col">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-indigo-500/5">
            <div className="flex items-center gap-2">
              <Sun className="w-5 h-5 text-amber-500" />
              <h2 className="text-lg font-semibold text-white">Rencana Harian (Morning Plan)</h2>
            </div>
            <span className="text-xs text-slate-400 bg-slate-800 px-2 py-1 rounded-md">Hari ini, 21 Jun 2026</span>
          </div>
          <div className="p-5 flex-1">
            <div className="space-y-4">
              <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700/50">
                <h3 className="text-sm font-medium text-slate-200 mb-3 flex items-center gap-2">
                  <HardHat className="w-4 h-4 text-indigo-400" />
                  Target Pekerjaan Utama
                </h3>
                <ul className="space-y-2">
                  <li className="flex items-start gap-2 text-sm">
                    <CheckCircle className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                    <span className="text-slate-300">Pengecoran plat lantai 1 zona A (Volume: 15 m3)</span>
                  </li>
                  <li className="flex items-start gap-2 text-sm">
                    <Clock className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                    <span className="text-slate-300">Fabrikasi besi tulangan balok lantai 2 (Target: 500 kg)</span>
                  </li>
                  <li className="flex items-start gap-2 text-sm">
                    <Clock className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                    <span className="text-slate-300">Pasangan bata merah dinding timur lt.1 (Area: 25 m2)</span>
                  </li>
                </ul>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-800/30 p-3 rounded-lg border border-slate-700/30">
                  <div className="text-xs text-slate-400 mb-1">Kebutuhan Material</div>
                  <div className="text-sm text-slate-200 font-medium">Ready Mix K-250 (3 Truk)</div>
                  <div className="text-sm text-slate-200 font-medium">Semen (20 Sak)</div>
                </div>
                <div className="bg-slate-800/30 p-3 rounded-lg border border-slate-700/30">
                  <div className="text-xs text-slate-400 mb-1">Manpower</div>
                  <div className="text-sm text-slate-200 font-medium">Tukang: 12 org</div>
                  <div className="text-sm text-slate-200 font-medium">Knek: 15 org</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Evening Report */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden flex flex-col">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Moon className="w-5 h-5 text-indigo-400" />
              <h2 className="text-lg font-semibold text-white">Laporan Harian (Evening Report)</h2>
            </div>
            <button className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg transition-colors">
              Generate Laporan
            </button>
          </div>
          <div className="p-5 flex-1 relative">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm flex flex-col items-center justify-center z-10 p-6 text-center">
              <Activity className="w-8 h-8 text-slate-500 mb-3" />
              <h3 className="text-slate-300 font-medium mb-1">Laporan Belum Tersedia</h3>
              <p className="text-slate-400 text-sm mb-4">Laporan harian biasanya digenerate setelah jam kerja selesai (17:00).</p>
              <button className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 hover:bg-slate-700 transition-colors">
                Draft Laporan Manual
              </button>
            </div>
            <div className="opacity-30 blur-sm pointer-events-none">
               <div className="space-y-4">
                  <div className="h-24 bg-slate-800 rounded-lg"></div>
                  <div className="h-16 bg-slate-800 rounded-lg"></div>
                  <div className="h-16 bg-slate-800 rounded-lg"></div>
               </div>
            </div>
          </div>
        </div>
      </div>

      {/* Progress Analytics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-5 bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl">
          <h3 className="text-sm font-medium text-slate-400 mb-4">Progress Fisik vs Plan</h3>
          <div className="flex items-end gap-3 mb-2">
            <div className="text-3xl font-bold text-white">18.5%</div>
            <div className="text-sm text-emerald-400 mb-1">+0.5% Ahead</div>
          </div>
          <div className="w-full bg-slate-800 rounded-full h-2 mt-4">
            <div className="bg-emerald-500 h-2 rounded-full" style={{ width: '18.5%' }}></div>
          </div>
          <div className="flex justify-between text-xs text-slate-500 mt-2">
            <span>Plan: 18.0%</span>
            <span>Target W3: 22.0%</span>
          </div>
        </div>

        <div className="p-5 bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl">
          <h3 className="text-sm font-medium text-slate-400 mb-4">Cost Performance Index (CPI)</h3>
          <div className="flex items-end gap-3 mb-2">
            <div className="text-3xl font-bold text-white">0.95</div>
            <div className="text-sm text-amber-400 mb-1">Slight Overrun</div>
          </div>
          <p className="text-xs text-slate-400 mt-4 leading-relaxed">
            Pengeluaran aktual sedikit melebihi nilai pekerjaan yang diselesaikan (Earned Value). Cek efisiensi material.
          </p>
        </div>

        <div className="p-5 bg-amber-500/10 border border-amber-500/20 rounded-xl">
          <div className="flex items-center gap-2 mb-3">
            <AlertOctagon className="w-5 h-5 text-amber-500" />
            <h3 className="text-sm font-medium text-amber-500">AI Alerts & Rekomendasi</h3>
          </div>
          <ul className="space-y-3 text-sm">
            <li className="flex gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-1.5 flex-shrink-0"></div>
              <span className="text-amber-200/80">Stok pasir diprediksi habis dalam 2 hari. Segera order.</span>
            </li>
            <li className="flex gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-1.5 flex-shrink-0"></div>
              <span className="text-amber-200/80">Produktivitas tukang pembesian 15% di bawah standar normal.</span>
            </li>
          </ul>
        </div>
      </div>

      {/* Photo Log */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Camera className="w-5 h-5 text-slate-400" />
            Log Foto Lapangan
          </h2>
          <button className="text-sm bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 px-4 py-2 rounded-lg transition-colors">
            Upload Foto
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {photos.map((photo, idx) => (
            <div key={idx} className="group relative rounded-lg overflow-hidden border border-slate-800">
              <img src={photo.url} alt={photo.caption} className="w-full h-48 object-cover group-hover:scale-105 transition-transform duration-500" />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-900/90 via-slate-900/20 to-transparent flex flex-col justify-end p-3">
                <p className="text-sm text-white font-medium truncate">{photo.caption}</p>
                <p className="text-xs text-slate-400">{photo.time}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
