import React from 'react';
import { 
  Building2, 
  CreditCard, 
  Bell, 
  Lock, 
  Cpu,
  Zap
} from 'lucide-react';

export default function PengaturanPage() {
  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-10">
      <div>
        <h1 className="text-2xl font-bold text-white">Pengaturan</h1>
        <p className="text-slate-400 text-sm mt-1">Kelola profil, preferensi, dan langganan workspace</p>
      </div>

      <div className="flex flex-col md:flex-row gap-6">
        {/* Settings Navigation */}
        <div className="w-full md:w-64 space-y-1">
          <button className="w-full flex items-center gap-3 px-4 py-3 bg-indigo-600/10 text-indigo-400 rounded-lg text-sm font-medium border border-indigo-500/20">
            <Building2 className="w-4 h-4" />
            Profil Perusahaan
          </button>
          <button className="w-full flex items-center gap-3 px-4 py-3 text-slate-400 hover:bg-slate-800/50 hover:text-slate-200 rounded-lg text-sm font-medium transition-colors">
            <Cpu className="w-4 h-4" />
            Preferensi AI
          </button>
          <button className="w-full flex items-center gap-3 px-4 py-3 text-slate-400 hover:bg-slate-800/50 hover:text-slate-200 rounded-lg text-sm font-medium transition-colors">
            <CreditCard className="w-4 h-4" />
            Billing & Langganan
          </button>
          <button className="w-full flex items-center gap-3 px-4 py-3 text-slate-400 hover:bg-slate-800/50 hover:text-slate-200 rounded-lg text-sm font-medium transition-colors">
            <Bell className="w-4 h-4" />
            Notifikasi
          </button>
        </div>

        {/* Settings Content Area */}
        <div className="flex-1 space-y-6">
          
          {/* Company Profile Form */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-white mb-6">Informasi Perusahaan</h2>
            
            <div className="space-y-5">
              <div className="flex gap-4 items-center mb-6">
                <div className="w-20 h-20 bg-slate-800 border border-slate-700 rounded-xl flex items-center justify-center text-slate-500">
                  <Building2 className="w-8 h-8" />
                </div>
                <div>
                  <button className="px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-sm text-slate-200 rounded-lg transition-colors mb-2">
                    Upload Logo
                  </button>
                  <p className="text-xs text-slate-500">Direkomendasikan ukuran 256x256px (PNG/JPG)</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-300">Nama Perusahaan</label>
                  <input type="text" defaultValue="PT Bangun Nusantara" className="w-full bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-lg px-4 py-2.5 focus:outline-none focus:border-indigo-500" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-300">Bidang Usaha</label>
                  <select className="w-full bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-lg px-4 py-2.5 focus:outline-none focus:border-indigo-500">
                    <option>Kontraktor Pelaksana</option>
                    <option>Konsultan Perencana</option>
                    <option>Developer / Owner</option>
                  </select>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-medium text-slate-300">Alamat Kantor</label>
                  <textarea rows={3} defaultValue="Jl. Sudirman No. 123, Jakarta Selatan" className="w-full bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-lg px-4 py-2.5 focus:outline-none focus:border-indigo-500 resize-none"></textarea>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-800 flex justify-end">
                <button className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-sm font-medium text-white rounded-lg transition-colors">
                  Simpan Perubahan
                </button>
              </div>
            </div>
          </div>

          {/* Plan Info Card */}
          <div className="bg-gradient-to-br from-indigo-900/40 to-slate-900 border border-indigo-500/20 rounded-xl p-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-6 opacity-10">
              <Zap className="w-32 h-32 text-indigo-400" />
            </div>
            <div className="relative z-10">
              <div className="inline-block px-3 py-1 bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 text-xs font-semibold rounded-full mb-4">
                PRO PLAN
              </div>
              <h2 className="text-xl font-bold text-white mb-2">Langganan Aktif</h2>
              <p className="text-sm text-slate-400 mb-6 max-w-md">Anda sedang menggunakan paket Pro. Nikmati fitur AI tanpa batas untuk manajemen konstruksi yang lebih efisien.</p>
              
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-700/50">
                  <p className="text-xs text-slate-400 mb-1">AI Tokens Usage</p>
                  <div className="flex items-end gap-2 mb-2">
                    <span className="text-lg font-bold text-white">45.2K</span>
                    <span className="text-xs text-slate-500 mb-1">/ 100K (Bulan ini)</span>
                  </div>
                  <div className="w-full bg-slate-800 rounded-full h-1.5">
                    <div className="bg-indigo-500 h-1.5 rounded-full" style={{ width: '45%' }}></div>
                  </div>
                </div>
                <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-700/50">
                  <p className="text-xs text-slate-400 mb-1">Storage Usage</p>
                  <div className="flex items-end gap-2 mb-2">
                    <span className="text-lg font-bold text-white">2.4 GB</span>
                    <span className="text-xs text-slate-500 mb-1">/ 10 GB</span>
                  </div>
                  <div className="w-full bg-slate-800 rounded-full h-1.5">
                    <div className="bg-emerald-500 h-1.5 rounded-full" style={{ width: '24%' }}></div>
                  </div>
                </div>
              </div>

              <button className="px-4 py-2 bg-white text-indigo-900 text-sm font-semibold rounded-lg hover:bg-slate-100 transition-colors">
                Upgrade Plan
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
